import type { DocumentMeta, ApplicationMeta, Comment, SearchFilters, ApplicationLocation, AuthorityConfig } from './types.js';
import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import { saveApplicationMeta, saveComments, getApplicationDir, getApplication } from './storage.js';
import { recordActivity } from './userData.js';
import { parseWfsCoords, coordsToLocation, escapeXml } from './geometry.js';
import { diffMeta } from './diff.js';
import { _electron as electron, chromium } from 'playwright';
import type { Page } from 'playwright';
import path from 'path';
import { getAuthority, DEFAULT_AUTHORITY_ID } from './authorities.js';

type DownloadFn = (trigger: () => Promise<unknown>, timeout: number) => Promise<{ filePath: string; filename: string }>;

// Idox names every uploaded document "<REF>-<NAME>-<id>.<ext>" (both in the bulk
// zip member path and in the file URL "/online-applications/files/<hash>/pdf/…"),
// so the trailing number is the stable per-document id. Two rows sharing an id are
// the same file listed twice; two rows with different ids are genuinely different
// documents even if they render the same date/type/description.
export function extractDocId(urlOrName: string): string | undefined {
  const m = /-(\d{4,})(?:\.\w+)?$/.exec(urlOrName.trim());
  return m?.[1];
}

export async function downloadDocuments(page: Page, download: DownloadFn, outDir: string, onProgress?: (message: string, current?: number, total?: number) => void, previousDocs?: DocumentMeta[]): Promise<DocumentMeta[]> {
  console.log('Navigating to Documents tab...');
  const docsTab = page.locator('#tab_documents');
  if (await docsTab.count() > 0) {
    await Promise.all([
      page.waitForNavigation(),
      docsTab.click()
    ]);
  } else {
    console.log('No documents tab found. Maybe there are no documents.');
    return [];
  }
  const docs: DocumentMeta[] = [];

  // Idox installs differ in document table layout (Cambridge has a leading checkbox
  // column plus Measure/Drawing Number; Wigan has a compact 4-column table). Detect the
  // column positions from the header row where possible, falling back to the
  // Greater Cambridge layout.
  const headerNames = await page.evaluate(() => {
    const table = document.querySelector('#Documents');
    const headerRow = table?.querySelector('tr');
    if (!headerRow) return [] as string[];
    return Array.from(headerRow.querySelectorAll('th, td')).map((c) => c.textContent?.trim() ?? '');
  });
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');
  const findIdx = (match: RegExp) => headerNames.findIndex((h) => match.test(normalize(h)));
  const dateIdx = findIdx(/date/);
  const typeIdx = findIdx(/type/);
  const descIdx = findIdx(/description/);
  const viewIdx = findIdx(/^(view|download)$/);
  const hasUsableHeaders = headerNames.length > 0 && dateIdx >= 0 && typeIdx >= 0 && descIdx >= 0 && viewIdx >= 0;
  const col = (fallback: number, detected: number) => (hasUsableHeaders ? detected : fallback);
  const DATE = col(1, dateIdx);
  const TYPE = col(2, typeIdx);
  const DESCRIPTION = col(5, descIdx);
  const VIEW = col(6, viewIdx);
  if (hasUsableHeaders) {
    console.log(`Document table columns detected: date=${dateIdx}, type=${typeIdx}, description=${descIdx}, view=${viewIdx}`);
  }

  const rows = page.locator('#Documents tbody tr:not(:first-child)');
  const count = await rows.count();
  console.log(`Found ${count} documents.`);

  const allDocs = [];

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const date = await row.locator('td').nth(DATE).innerText();
    const type = await row.locator('td').nth(TYPE).innerText();
    const description = await row.locator('td').nth(DESCRIPTION).innerText();
    
    const linkLocator = row.locator('td').nth(VIEW).locator('a');
    if (await linkLocator.count() > 0) {
      const baseName = `${date.replace(/\//g, '-')} - ${type.replace(/\//g, '-').trim()} - ${description.replace(/[^a-zA-Z0-9 -]/g, '').trim()}`;
      
      const viewHref = (await linkLocator.getAttribute('href')) ?? '';

      const bulkCheckLocator = row.locator('.bulkCheck');
      const hasBulkCheck = await bulkCheckLocator.count() > 0;
      let zipFilename = '';
      if (hasBulkCheck) {
        const value = await bulkCheckLocator.getAttribute('value');
        if (value) {
            zipFilename = value.split('/').pop() || '';
        }
      }
      
      allDocs.push({
          row,
          baseName,
          datePublished: date.trim(),
          documentType: type.trim(),
          description: description.trim(),
          docId: extractDocId(viewHref) ?? extractDocId(zipFilename),
          viewHref,
          hasBulkCheck,
          bulkCheckLocator,
          linkLocator,
          zipFilename
      });
    }
  }

  // Idox portals can list the same document more than once (e.g. under both
  // "Documents" and another category), but two rows that merely render the same
  // date/type/description are NOT necessarily the same file — each upload has its
  // own portal document id, so genuinely different versions (a superseded
  // revision, a .pdf and its source .docx, two letters published the same day) can
  // look identical. Dedupe on the underlying file id (falling back to the file
  // URL / zip member), never on the rendered name, so distinct versions are kept.
  const seenFileIds = new Set<string>();
  const uniqueDocs = allDocs.filter((d) => {
    const fileId = d.docId || d.viewHref || d.zipFilename || d.baseName;
    if (seenFileIds.has(fileId)) {
      console.log(`Skipping duplicate row (same file): ${d.baseName}`);
      return false;
    }
    seenFileIds.add(fileId);
    return true;
  });

  // How many distinct documents each rendered name maps to. When it is more than
  // one, an existing file of that name can't be assumed to be any particular one.
  const rowsPerBaseName = new Map<string, number>();
  for (const doc of uniqueDocs) {
    rowsPerBaseName.set(doc.baseName, (rowsPerBaseName.get(doc.baseName) ?? 0) + 1);
  }

  // Documents recorded by previous scrapes, indexed by portal id so a re-scrape
  // reuses the exact stored filename instead of guessing from the rendered name.
  const previousByDocId = new Map<string, DocumentMeta>();
  for (const pd of previousDocs ?? []) {
    if (pd.docId) previousByDocId.set(pd.docId, pd);
  }

  const missingDocs = [];
  const reusedFiles = new Set<string>();

  // Optional fields (docId) must be omitted rather than set to undefined under
  // exactOptionalPropertyTypes, so build the metadata fields for a row here.
  const docMetaFields = (doc: { datePublished: string; documentType: string; description: string; docId: string | undefined }) => ({
    datePublished: doc.datePublished,
    documentType: doc.documentType,
    description: doc.description,
    ...(doc.docId ? { docId: doc.docId } : {})
  });

  const total = uniqueDocs.length;
  let done = 0;
  const report = () => onProgress?.('Downloading documents', done, total);
  report();

  const existingFiles = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
  for (const doc of uniqueDocs) {
    const recorded = doc.docId ? previousByDocId.get(doc.docId) : undefined;
    const sharesName = (rowsPerBaseName.get(doc.baseName) ?? 0) > 1;
    const fileOnDisk = existingFiles.find(f => f.startsWith(doc.baseName + '.'));

    // Same document as a previous scrape and its file is still there: re-use it.
    if (recorded && existingFiles.includes(recorded.localFilename)) {
      console.log(`Skipping existing: ${recorded.localFilename}`);
      docs.push({
        localFilename: recorded.localFilename,
        ...docMetaFields(doc)
      });
      reusedFiles.add(recorded.localFilename);
      done++;
      report();
      continue;
    }

    // No portal id (older scrape or a portal that doesn't expose one) and this
    // rendered name is unambiguous: a file already on disk is that document.
    if (!recorded && !sharesName && fileOnDisk) {
      console.log(`Skipping existing: ${fileOnDisk}`);
      docs.push({
        localFilename: fileOnDisk,
        ...docMetaFields(doc)
      });
      reusedFiles.add(fileOnDisk);
      done++;
      report();
      continue;
    }

    // Distinct documents sharing a name (or a missing recorded file) must each be
    // downloaded; filenames are disambiguated below so nothing is overwritten.
    missingDocs.push(doc);
  }

  // Filenames are generated from the rendered name, which distinct documents can
  // share. Allocate names that are unique across what's already on disk and what
  // this run produces, appending " (2)", " (3)", … on collision.
  const usedNames = new Set(existingFiles);
  const allocateFilename = (name: string): string => {
    const dot = name.lastIndexOf('.');
    if (dot <= 0) {
      let candidate = name;
      for (let i = 2; usedNames.has(candidate); i++) candidate = `${name} (${i})`;
      usedNames.add(candidate);
      return candidate;
    }
    const stem = name.slice(0, dot);
    const ext = name.slice(dot);
    let candidate = name;
    for (let i = 2; usedNames.has(candidate); i++) candidate = `${stem} (${i})${ext}`;
    usedNames.add(candidate);
    return candidate;
  };

  const bulkDownloadable = missingDocs.filter(d => d.hasBulkCheck && d.zipFilename);
  const individualDownloadable = missingDocs.filter(d => !d.hasBulkCheck || !d.zipFilename);

  if (missingDocs.length > 0) {
      console.log(`Need to download ${bulkDownloadable.length} in bulk, and ${individualDownloadable.length} individually.`);
  }

  const CHUNK_SIZE = 25;
  for (let i = 0; i < bulkDownloadable.length; i += CHUNK_SIZE) {
      const chunk = bulkDownloadable.slice(i, i + CHUNK_SIZE);
      console.log(`Downloading bulk batch ${Math.floor(i/CHUNK_SIZE) + 1} with ${chunk.length} documents...`);
      
      for (const doc of chunk) {
          await doc.bulkCheckLocator.check();
      }
      
      const btn = page.locator('#downloadFiles');
      try {
        await page.waitForFunction(() => {
          const b = document.querySelector<HTMLInputElement>('#downloadFiles');
          return b && !b.disabled;
        }, undefined, { timeout: 5000 });
      } catch (e) {
        // Force enable if the page scripts failed to do so
        await btn.evaluate(node => node.removeAttribute('disabled'));
      }
      
      try {
        const { filePath: zipPath, filename: zipName } = await download(
          () => btn.click({ noWaitAfter: true }),
          300000
        );
        
        const zip = new AdmZip(zipPath);
        
        for (const doc of chunk) {
            const entry = zip.getEntry(doc.zipFilename);
            if (entry) {
                const data = entry.getData();
                const ext = path.extname(doc.zipFilename) || '.pdf';
                const finalName = allocateFilename(`${doc.baseName}${ext}`);
                fs.writeFileSync(path.join(outDir, finalName), data);
                docs.push({
                    localFilename: finalName,
                    ...docMetaFields(doc)
                });
                console.log(`Extracted: ${finalName}`);
                done++;
                report();
            } else {
                console.warn(`Could not find ${doc.zipFilename} in the downloaded zip! Falling back to individual for this item.`);
                individualDownloadable.push(doc);
            }
        }
        
        fs.unlinkSync(zipPath);
        
      } catch (e) {
          console.error(`Failed to download batch:`, e);
          for (const doc of chunk) {
              individualDownloadable.push(doc);
          }
      }
      
      for (const doc of chunk) {
          await doc.bulkCheckLocator.uncheck();
      }
      
  }

  for (const doc of individualDownloadable) {
      console.log(`Downloading individually: ${doc.baseName}`);
      try {
        const { filePath, filename } = await download(
          () => doc.linkLocator.click(),
          30000
        );
        const suggestedExt = path.extname(filename) || '.pdf';
        const finalName = allocateFilename(`${doc.baseName}${suggestedExt}`);
        fs.copyFileSync(filePath, path.join(outDir, finalName));
        docs.push({
          localFilename: finalName,
          ...docMetaFields(doc)
        });
      } catch (e) {
        console.error(`Failed to download ${doc.baseName}:`, e);
      }
      done++;
      report();
  }

  // When distinct documents share a rendered name and this run downloaded them
  // afresh, any pre-existing file for that name that we neither re-used nor
  // produced is an ambiguous leftover from before portal ids were recorded (we
  // can't tell which document it belonged to). Drop it so it doesn't linger as an
  // unreferenced duplicate.
  const produced = new Set(docs.map(d => d.localFilename));
  const leftoversToRemove = new Set<string>();
  for (const doc of uniqueDocs) {
    if ((rowsPerBaseName.get(doc.baseName) ?? 0) <= 1) continue;
    for (const f of existingFiles) {
      if (f.startsWith(doc.baseName + '.') && !reusedFiles.has(f) && !produced.has(f)) {
        leftoversToRemove.add(f);
      }
    }
  }
  for (const f of leftoversToRemove) {
    fs.unlinkSync(path.join(outDir, f));
    console.log(`Removed ambiguous leftover: ${f}`);
  }

  return docs;
}

export async function scrapeComments(page: Page, outDir: string): Promise<boolean> {
  console.log('Navigating to Comments tab...');
  
  const commentsTab = page.locator('#tab_makeComment');
  if (await commentsTab.count() > 0) {
    await Promise.all([
      page.waitForNavigation(),
      commentsTab.click()
    ]);
    
    const neighbourCommentsTab = page.locator('#subtab_neighbourComments');
    if (await neighbourCommentsTab.count() > 0) {
      await Promise.all([
        page.waitForNavigation(),
        neighbourCommentsTab.click()
      ]);
      const allComments: Comment[] = [];
      
      while (true) {
        await page.waitForSelector('.comment', { timeout: 5000 }).catch(() => {});
        const commentsOnPage = await page.$$eval('.comment', nodes => nodes.map(node => {
          const address = (node.querySelector('.consultationAddress') as HTMLElement)?.innerText?.trim() || '';
          const stance = (node.querySelector('.consultationStance') as HTMLElement)?.innerText?.replace(/[()]/g, '').trim() || '';
          let dateText = (node.querySelector('.comment-wrapper h2') as HTMLElement)?.innerText?.trim() || '';
          dateText = dateText.replace('Comment submitted date:', '').trim();
          const text = (node.querySelector('.comment-text') as HTMLElement)?.innerText?.trim() || '';
          return { address, stance, date: dateText, text };
        }));
        
        allComments.push(...commentsOnPage);
        
        const nextBtn = page.locator('p.pager.bottom a.next');
        if (await nextBtn.count() > 0) {
          await Promise.all([
            page.waitForNavigation(),
            nextBtn.click()
          ]);
        } else {
          break;
        }
      }
      if (allComments.length > 0) {
        saveComments(path.basename(outDir), allComments);
        console.log(`Saved ${allComments.length} comments`);
        return true;
      } else {
        console.log('No comments found on the comments tab.');
      }
    } else {
      console.log('No neighbour comments sub-tab found.');
    }
  } else {
    console.log('No comments tab found.');
  }
  return false;
}

export async function scrapeLocation(page: Page, reference: string, authority: AuthorityConfig): Promise<ApplicationLocation | null> {
  if (!authority.map) {
    console.log(`No map configuration for ${authority.id}; skipping location lookup.`);
    return null;
  }

  const filterXml = `<Filter xmlns="http://www.opengis.net/ogc"><PropertyIsEqualTo><PropertyName>${authority.map.refField}</PropertyName><Literal>${escapeXml(reference)}</Literal></PropertyIsEqualTo></Filter>`;
  const filterEnc = encodeURIComponent(filterXml);

  for (const layer of authority.map.layers) {
    try {
      const url = `${authority.map.wfsUrl}?map=pa&service=WFS&version=2.0.0&accessType=PA&request=GetFeature&typename=${layer}&filter=${filterEnc}`;
      const xml = await page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: 'include' });
        return await res.text();
      }, url);
      const coords = parseWfsCoords(xml);
      if (coords.length > 0) {
        console.log(`Found location geometry (${coords.length} points) for ${reference}`);
        return coordsToLocation(coords);
      }
    } catch (err) {
      console.error(`Failed to scrape ${layer} geometry for ${reference}:`, err);
    }
  }
  console.log(`No location geometry found for ${reference}`);
  return null;
}

interface PageHandle {
  page: Page;
  close: () => Promise<void>;
  download: DownloadFn;
}

async function createElectronPage(): Promise<PageHandle> {
  // Running inside Electron: launch this same binary in scraper-host mode to
  // reuse its own Chromium, so no separate Playwright browser is required. A
  // temp user-data dir keeps it isolated from the app's own session.
  // Downloads are captured via CDP into a temp dir (Electron pages don't
  // emit Playwright's "download" event).
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planbrowser-scrape-'));
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planbrowser-dl-'));
  const electronApp = await electron.launch({
    executablePath: process.execPath,
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...process.env, PLANBROWSER_SCRAPER_MODE: '1' }
  });
  const page = await electronApp.firstWindow();
  // Electron surfaces page alert()/confirm()/prompt() as native dialogs
  // (e.g. the Idox "maximum 25 documents" message), which would pop a
  // visible dialog over everything and block the scrape. Neutralise them and
  // auto-accept anything that still slips through.
  await page.addInitScript(() => {
    (window as any).alert = () => {};
    (window as any).confirm = () => true;
    (window as any).prompt = () => null;
  });
  page.on('dialog', (dialog) => { void dialog.accept(); });
  const session = await page.context().newCDPSession(page);
  await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  return {
    page,
    close: async () => {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
      fs.rmSync(downloadDir, { recursive: true, force: true });
    },
    download: async (trigger, timeout) => {
      const before = new Set(fs.readdirSync(downloadDir));
      await trigger();
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const file = fs.readdirSync(downloadDir).find((f) => !before.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.download'));
        if (file) {
          return { filePath: path.join(downloadDir, file), filename: file };
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error('Download timed out');
    }
  };
}

async function createChromiumPage(): Promise<PageHandle> {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: false });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planbrowser-dl-'));
  return {
    page,
    close: async () => {
      await context.close();
      await browser.close();
      fs.rmSync(downloadDir, { recursive: true, force: true });
    },
    download: async (trigger, timeout) => {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout }),
        trigger()
      ]);
      const filename = dl.suggestedFilename() || 'download';
      const filePath = path.join(downloadDir, filename);
      await dl.saveAs(filePath);
      return { filePath, filename };
    }
  };
}

function createPage(): Promise<PageHandle> {
  return process.env.PLANBROWSER_ELECTRON === '1'
    ? createElectronPage()
    : createChromiumPage();
}

// Pick a stable, shareable URL for an application. After a single-result search
// the browser sits on the session-bound "advancedSearchResults.do" page (Idox
// stores the results server-side against the JSESSIONID), so page.url() 500s when
// opened later in a fresh session. The canonical applicationDetails.do?keyVal=
// links on that page are not session-bound and work from a cold browser, so
// prefer one of those; fall back to the current URL only if none are present.
export function resolvePortalUrl(currentUrl: string, hrefs: string[]): string {
  if (/applicationDetails\.do/.test(currentUrl) && /keyVal=/.test(currentUrl)) {
    return currentUrl;
  }
  const isDetailLink = (href: string) => /applicationDetails\.do/.test(href) && /keyVal=/.test(href);
  const summary = hrefs.find((href) => isDetailLink(href) && /activeTab=summary/.test(href));
  if (summary) return summary;
  const first = hrefs.find(isDetailLink);
  return first ?? currentUrl;
}

export async function downloadApplication(reference: string, authorityId: string = DEFAULT_AUTHORITY_ID, onProgress?: (message: string, current?: number, total?: number) => void) {
  const authority = getAuthority(authorityId);
  console.log(`Starting search for reference: ${reference} (authority: ${authority.id})`);

  const previous = getApplication(reference, authority.id);

  const outDir = getApplicationDir(reference, authority.id);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const { page, close, download } = await createPage();
  
  try {
    await page.goto(`${authority.baseUrl}/search.do?action=advanced&searchType=Application`);
    
    await page.fill('#reference', reference);
    await Promise.all([
      page.waitForNavigation(),
      page.click('input[type="submit"]')
    ]);

    if (await page.locator('#searchResultsContainer').count() > 0) {
      throw new Error(`Multiple results found for reference "${reference}" on ${authority.name}. Cannot determine the exact match.`);
    } else if (await page.locator('.messagebox:has-text("No results found")').count() > 0) {
      throw new Error(`Application reference "${reference}" not found on ${authority.name} (${authority.baseUrl}).`);
    } else if (!await page.locator('#applicationDetails').count() && !await page.locator('#simpleDetailsTable').count()) {
      const html = (await page.content()).slice(0, 500);
      throw new Error(`Did not land on the application details page for "${reference}" on ${authority.name}. Unexpected page structure (is this portal actually Idox?). HTML: ${html}`);
    }
    
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    const currentUrl = page.url();
    const detailHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="applicationDetails.do"]')).map((a) => a.href)
    );

    const meta: ApplicationMeta = {
      reference: reference,
      authorityId: authority.id,
      address: '',
      description: '',
      status: '',
      dates: {},
      documents: [],
      hasComments: false,
      scrapedAt: new Date().toISOString(),
      portalUrl: resolvePortalUrl(currentUrl, detailHrefs)
    };

    const detailsTable = page.locator('#simpleDetailsTable tr');
    const rowCount = await detailsTable.count();
    for (let i = 0; i < rowCount; i++) {
      const row = detailsTable.nth(i);
      if (await row.locator('th').count() > 0 && await row.locator('td').count() > 0) {
        const th = await row.locator('th').innerText();
        const td = await row.locator('td').innerText();
        
        const key = th.trim().replace(/:$/, '');
        const value = td.trim();
        
        if (key === 'Reference') {
          meta.reference = value || meta.reference;
          if (meta.reference.toUpperCase() !== reference.toUpperCase()) {
            throw new Error(`Landing page reference "${meta.reference}" does not match requested reference "${reference}" on ${authority.name}. Aborting to avoid downloading the wrong application.`);
          }
        } else if (key === 'Address') {
          meta.address = value;
        } else if (key === 'Proposal') {
          meta.description = value;
        } else if (key === 'Status') {
          meta.status = value;
        } else {
          meta.dates[key] = value;
        }
      }
    }


    // Get tab URLs before we navigate away
    const tabLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).filter(a => a.href.includes('activeTab=')).map(a => ({
        text: a.textContent.trim(),
        href: a.href
      }));
    });

    const scrapeTabTable = async (tabName: string) => {
      const tab = tabLinks.find(t => t.text.includes(tabName) || t.text === tabName);
      if (tab) {
        console.log(`Navigating to ${tabName} tab...`);
        await Promise.all([
          page.waitForNavigation(),
          page.goto(tab.href)
        ]);
        return await page.evaluate(() => {
          const rows = document.querySelectorAll('table tr');
          return Array.from(rows).reduce((acc, tr) => {
            const th = tr.querySelector('th')?.textContent.trim();
            const td = tr.querySelector('td')?.textContent.trim();
            if (th && td) {
              acc[th.replace(/:$/, '')] = td;
            }
            return acc;
          }, {} as Record<string, string>);
        });
      }
      return undefined;
    };

    const further = await scrapeTabTable('Further Information') || await scrapeTabTable('Details');
    if (further) {
      meta.furtherInformation = further;
    }
    const dates = await scrapeTabTable('Important Dates');
    if (dates) {
      meta.importantDates = dates;
    }

    const location = await scrapeLocation(page, meta.reference, authority);
    if (location) {
      meta.location = location;
    }

    meta.documents = await downloadDocuments(page, download, outDir, onProgress, previous?.documents);

    // Persist the document list immediately, before anything later (like comment
    // scraping) can fail and leave freshly-downloaded documents unrecorded. Keep
    // the previous comment flag so a failed comment scrape doesn't hide comments
    // that were already known.
    meta.hasComments = previous?.hasComments ?? false;
    saveApplicationMeta(reference, meta, authority.id);
    console.log('Saved metadata.json');

    // Comment scraping is best-effort: it must not lose the document metadata
    // above or fail the whole download.
    try {
      const hasComments = await scrapeComments(page, outDir);
      if (hasComments !== meta.hasComments) {
        meta.hasComments = hasComments;
        saveApplicationMeta(reference, meta, authority.id);
      }
    } catch (err) {
      console.error('Failed to scrape comments (continuing):', err);
    }

    const { changes, message, newDocuments } = diffMeta(previous, meta);
    if (!previous || changes.length > 0) {
      recordActivity({
        reference: meta.reference,
        authorityId: authority.id,
        message,
        changes,
        newDocuments
      });
    }

    console.log(`Done! Files saved in ${outDir}`);
    return meta;

  } catch (err) {
    console.error('Error during execution:', err);
    throw err;
  } finally {
    await close().catch(() => {});
  }
}

export async function searchPlanIt(postcode: string, radius: string, filters: SearchFilters = {}) {
  const params = new URLSearchParams({
    pcode: postcode,
    krad: radius,
    pg_sz: '50',
    sort: '-start_date'
  });
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  const res = await fetch(`https://www.planit.org.uk/api/applics/json?${params.toString()}`, {
    headers: {
      'User-Agent': 'planbrowser/1.0 (https://github.com/olane/planbrowser)'
    }
  });
  if (!res.ok) {
    throw new Error(`PlanIt API returned ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data;
}
