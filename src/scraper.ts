import type { DocumentMeta, ApplicationMeta, Comment, SearchFilters, ApplicationLocation, AuthorityConfig, ChangeEntry } from './types.js';
import AdmZip from 'adm-zip';
import fs from 'fs';
import * as cheerio from 'cheerio';
import proj4 from 'proj4';
import { saveApplicationMeta, saveComments, getApplicationDir, getApplication } from './storage.js';
import { recordActivity } from './userData.js';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import path from 'path';
import { getAuthority, DEFAULT_AUTHORITY_ID } from './authorities.js';

proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs');

export async function downloadDocuments(page: Page, outDir: string, onProgress?: (message: string, current?: number, total?: number) => void): Promise<DocumentMeta[]> {
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
          hasBulkCheck,
          bulkCheckLocator,
          linkLocator,
          zipFilename
      });
    }
  }

  const missingDocs = [];
  
  const total = allDocs.length;
  let done = 0;
  const report = () => onProgress?.('Downloading documents', done, total);
  report();

  const existingFiles = fs.existsSync(outDir) ? fs.readdirSync(outDir) : [];
  for (const doc of allDocs) {
      const existing = existingFiles.find(f => f.startsWith(doc.baseName + '.'));
      if (existing) {
          console.log(`Skipping existing: ${existing}`);
          docs.push({
              localFilename: existing,
              datePublished: doc.datePublished,
              documentType: doc.documentType,
              description: doc.description
          });
          done++;
          report();
      } else {
          missingDocs.push(doc);
      }
  }

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
            const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 300000 }),
            btn.click({ noWaitAfter: true, timeout: 300000 })
        ]);
        
        const zipPath = path.join(outDir, `batch-${Date.now()}.zip`);
        await download.saveAs(zipPath);
        
        const zip = new AdmZip(zipPath);
        
        for (const doc of chunk) {
            const entry = zip.getEntry(doc.zipFilename);
            if (entry) {
                const data = entry.getData();
                const ext = path.extname(doc.zipFilename) || '.pdf';
                const finalName = `${doc.baseName}${ext}`;
                fs.writeFileSync(path.join(outDir, finalName), data);
                docs.push({
                    localFilename: finalName,
                    datePublished: doc.datePublished,
                    documentType: doc.documentType,
                    description: doc.description
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
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }),
          doc.linkLocator.click()
        ]);
        const suggestedExt = path.extname(download.suggestedFilename()) || '.pdf';
        const finalName = `${doc.baseName}${suggestedExt}`;
        await download.saveAs(path.join(outDir, finalName));
        docs.push({
          localFilename: finalName,
          datePublished: doc.datePublished,
          documentType: doc.documentType,
          description: doc.description
        });
      } catch (e) {
        console.error(`Failed to download ${doc.baseName}:`, e);
      }
      done++;
      report();
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

function parseWfsCoords(xml: string): Array<[number, number]> {
  if (!xml || xml.includes('numberReturned="0"') || xml.includes('numberMatched="0"')) {
    return [];
  }
  const $ = cheerio.load(xml, { xmlMode: true });
  const coords: Array<[number, number]> = [];
  $('gml\\:pos, gml\\:posList').each((_, el) => {
    const parts = $(el).text().trim().split(/\s+/).map(Number);
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const x = parts[i];
      const y = parts[i + 1];
      if (typeof x === 'number' && typeof y === 'number') {
        coords.push([x, y]);
      }
    }
  });
  return coords;
}

function coordsToLocation(coords: Array<[number, number]>): ApplicationLocation {
  let sumX = 0;
  let sumY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    sumX += x;
    sumY += y;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const centerX = sumX / coords.length;
  const centerY = sumY / coords.length;
  const [centerLon, centerLat] = proj4('EPSG:27700', 'EPSG:4326', [centerX, centerY]);
  const [minLon, minLat] = proj4('EPSG:27700', 'EPSG:4326', [minX, minY]);
  const [maxLon, maxLat] = proj4('EPSG:27700', 'EPSG:4326', [maxX, maxY]);
  return {
    center: { lat: centerLat, lon: centerLon },
    bbox: { minLon, minLat, maxLon, maxLat }
  };
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));

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

function diffMeta(previous: ApplicationMeta | null, meta: ApplicationMeta): { changes: ChangeEntry[]; message: string } {
  if (!previous) {
    return { changes: [], message: 'Application added' };
  }
  const changes: ChangeEntry[] = [];
  if (previous.status && meta.status && previous.status !== meta.status) {
    changes.push({ field: 'Status', before: previous.status, after: meta.status });
  }
  if (previous.address && meta.address && previous.address !== meta.address) {
    changes.push({ field: 'Address', before: previous.address, after: meta.address });
  }
  if (previous.description && meta.description && previous.description !== meta.description) {
    changes.push({ field: 'Proposal', before: previous.description, after: meta.description });
  }
  const prevDocNames = new Set(previous.documents.map((d) => d.localFilename));
  const newDocs = meta.documents.filter((d) => !prevDocNames.has(d.localFilename));
  if (newDocs.length > 0) {
    changes.push({ field: 'Documents', after: `${newDocs.length} new document${newDocs.length === 1 ? '' : 's'}` });
  }
  if (!previous.hasComments && meta.hasComments) {
    changes.push({ field: 'Comments', after: 'Comments are now available' });
  }
  const prevDates = previous.importantDates ?? {};
  const newDates = meta.importantDates ?? {};
  for (const [key, value] of Object.entries(newDates)) {
    const before = prevDates[key];
    if (before && before !== value) {
      changes.push({ field: key, before, after: value });
    }
  }
  return {
    changes,
    message: changes.length > 0 ? 'Application updated' : 'No changes detected'
  };
}

export async function downloadApplication(reference: string, authorityId: string = DEFAULT_AUTHORITY_ID, onProgress?: (message: string, current?: number, total?: number) => void) {
  const authority = getAuthority(authorityId);
  console.log(`Starting search for reference: ${reference} (authority: ${authority.id})`);

  const previous = getApplication(reference, authority.id);

  const outDir = getApplicationDir(reference, authority.id);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true, chromiumSandbox: false });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
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
      throw new Error(`Did not land on the application details page for "${reference}" on ${authority.name}. Unexpected page structure (is this portal actually Idox?).`);
    }
    
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    if (!await page.locator('#applicationDetails').count() && !await page.locator('#simpleDetailsTable').count()) {
       throw new Error(`Did not land on the application details page for "${reference}" on ${authority.name}. HTML: ${(await page.content()).slice(0, 500)}`);
    }

    const meta: ApplicationMeta = {
      reference: reference,
      authorityId: authority.id,
      address: '',
      description: '',
      status: '',
      dates: {},
      documents: [],
      hasComments: false,
      scrapedAt: new Date().toISOString()
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

    meta.documents = await downloadDocuments(page, outDir, onProgress);
    meta.hasComments = await scrapeComments(page, outDir);
    saveApplicationMeta(reference, meta, authority.id);
    console.log('Saved metadata.json');

    const { changes, message } = diffMeta(previous, meta);
    if (!previous || changes.length > 0) {
      recordActivity({
        reference: meta.reference,
        authorityId: authority.id,
        message,
        changes
      });
    }

    console.log(`Done! Files saved in ${outDir}`);
    return meta;

  } catch (err) {
    console.error('Error during execution:', err);
    throw err;
  } finally {
    await browser.close();
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
