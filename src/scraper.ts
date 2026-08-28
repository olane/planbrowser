export interface DocumentMeta {
  localFilename: string;
  datePublished: string;
  documentType: string;
  description: string;
}

export interface ApplicationMeta {
  reference: string;
  address: string;
  description: string;
  status: string;
  dates: Record<string, string>;
  documents: DocumentMeta[];
  hasComments: boolean;
  scrapedAt: string;
}

import AdmZip from 'adm-zip';
import fs from 'fs';
import { chromium, Page } from 'playwright';
import path from 'path';
import { setTimeout } from 'timers/promises';

const BASE_URL = 'https://applications.greatercambridgeplanning.org/online-applications';

export async function downloadDocuments(page: Page, outDir: string): Promise<DocumentMeta[]> {
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

  const rows = page.locator('#Documents tbody tr:not(:first-child)');
  const count = await rows.count();
  console.log(`Found ${count} documents.`);

  const allDocs = [];

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const date = await row.locator('td').nth(1).innerText();
    const type = await row.locator('td').nth(2).innerText();
    const description = await row.locator('td').nth(5).innerText();
    
    const linkLocator = row.locator('td').nth(6).locator('a');
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
      if (await btn.isDisabled()) {
          await page.evaluate(() => {
              // @ts-ignore
              if (typeof buttonSwitch === 'function') buttonSwitch(25);
          });
          if (await btn.isDisabled()) {
              await btn.evaluate(node => node.removeAttribute('disabled'));
          }
      }
      
      try {
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 60000 }),
            btn.click()
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
      
      await setTimeout(2000);
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
        console.log(`Saved ${finalName}, waiting 2 seconds...`);
        await setTimeout(2000);
      } catch (e) {
        console.error(`Failed to download ${doc.baseName}:`, e);
      }
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

      const commentsList = page.locator('.comments, #neighbourComments');
      if (await commentsList.count() > 0) {
        const commentsText = await commentsList.innerText();
        fs.writeFileSync(path.join(outDir, 'comments.txt'), commentsText);
        console.log('Saved comments.txt');
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

export async function downloadApplication(reference: string) {
  console.log(`Starting search for reference: ${reference}`);
  
  const outDir = path.join(process.cwd(), 'downloads', reference.replace(/\//g, '-'));
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    await page.goto(`${BASE_URL}/search.do?action=simple&searchType=Application`);
    
    await page.fill('#simpleSearchString', reference);
    await Promise.all([
      page.waitForNavigation(),
      page.click('input[type="submit"]')
    ]);

    if (await page.locator('#searchResultsContainer').count() > 0) {
      console.log('Multiple results found. Finding exact match...');
      const resultLink = page.locator(`a:has-text("${reference}")`);
      if (await resultLink.count() > 0) {
        await Promise.all([
          page.waitForNavigation(),
          resultLink.first().click()
        ]);
      } else {
        console.error(`Reference "${reference}" not found in the search results list.`);
        return;
      }
    } else if (await page.locator('.messagebox:has-text("No results found")').count() > 0) {
      console.error(`Application reference "${reference}" not found.`);
      return;
    } else if (!await page.locator('#applicationDetails').count() && !await page.locator('#simpleDetailsTable').count()) {
      console.log('Did not land on application details page. Unexpected page structure.');
      return;
    }
    
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    if (!await page.locator('#applicationDetails').count() && !await page.locator('#simpleDetailsTable').count()) {
       console.log('Did not land on application details page. HTML:', await page.content());
       return;
    }

    const meta: ApplicationMeta = {
      reference: reference,
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

    meta.documents = await downloadDocuments(page, outDir);
    meta.hasComments = await scrapeComments(page, outDir);

    fs.writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(meta, null, 2));
    console.log('Saved metadata.json');

    console.log(`Done! Files saved in ${outDir}`);
    return meta;

  } catch (err) {
    console.error('Error during execution:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

export async function searchPlanIt(postcode: string, radius: string) {
  const res = await fetch(`https://www.planit.org.uk/api/applics/json?pcode=${encodeURIComponent(postcode)}&krad=${radius}&pg_sz=50`, {
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
