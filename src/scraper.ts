import type { DocumentMeta, ApplicationMeta, Comment, SearchFilters, ApplicationLocation } from './types.js';
import AdmZip from 'adm-zip';
import fs from 'fs';
import * as cheerio from 'cheerio';
import proj4 from 'proj4';
import { saveApplicationMeta, saveComments } from './storage.js';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import path from 'path';

const BASE_URL = 'https://applications.greatercambridgeplanning.org/online-applications';

proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs');

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

const MAP_WFS_URL = 'https://applications.greatercambridgeplanning.org/PAM/LIVE/MapServer';
const MAP_LAYERS = ['Planning_Application_Points', 'Planning_Application_Polygons'];

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

export async function scrapeLocation(page: Page, reference: string): Promise<ApplicationLocation | null> {
  const filterXml = `<Filter xmlns="http://www.opengis.net/ogc"><PropertyIsEqualTo><PropertyName>REFVAL</PropertyName><Literal>${escapeXml(reference)}</Literal></PropertyIsEqualTo></Filter>`;
  const filterEnc = encodeURIComponent(filterXml);

  for (const layer of MAP_LAYERS) {
    try {
      const url = `${MAP_WFS_URL}?map=pa&service=WFS&version=2.0.0&accessType=PA&request=GetFeature&typename=${layer}&filter=${filterEnc}`;
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

    const location = await scrapeLocation(page, meta.reference);
    if (location) {
      meta.location = location;
    }

    meta.documents = await downloadDocuments(page, outDir);
    meta.hasComments = await scrapeComments(page, outDir);
    saveApplicationMeta(reference, meta);
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
