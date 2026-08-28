import fs from 'fs';
import { chromium, Page } from 'playwright';
import { Command } from 'commander';
import path from 'path';
import { setTimeout } from 'timers/promises';
const BASE_URL = 'https://applications.greatercambridgeplanning.org/online-applications';
async function downloadDocuments(page: Page, outDir: string) {
  console.log('Navigating to Documents tab...');
  // Try to find and click the documents tab
  const docsTab = page.locator('#tab_documents');
  if (await docsTab.count() > 0) {
    await Promise.all([
      page.waitForNavigation(),
      docsTab.click()
    ]);
  } else {
    console.log('No documents tab found. Maybe there are no documents.');
    return;
  }

  // The document table
  const rows = page.locator('#Documents tbody tr:not(:first-child)'); // skip header
  const count = await rows.count();
  console.log(`Found ${count} documents.`);

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const date = await row.locator('td').nth(1).innerText();
    const type = await row.locator('td').nth(2).innerText();
    const description = await row.locator('td').nth(5).innerText();
    
    const linkLocator = row.locator('td').nth(6).locator('a');
    if (await linkLocator.count() > 0) {
      const fileName = `${date.replace(/\//g, '-')} - ${type.trim()} - ${description.replace(/[^a-zA-Z0-9 -]/g, '').trim()}.pdf`;
      const filePath = path.join(outDir, fileName);
      
      console.log(`Downloading: ${fileName}`);
      try {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }),
          linkLocator.click()
        ]);
        await download.saveAs(filePath);
        console.log(`Saved ${fileName}, waiting 2 seconds...`);
        await setTimeout(2000); // Polite delay to avoid IP blocks
      } catch (e) {
        console.error(`Failed to download ${fileName}:`, e);
      }
    }
  }
}

async function scrapeComments(page: Page, outDir: string) {
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
      } else {
        console.log('No comments found on the comments tab.');
      }
    } else {
      console.log('No neighbour comments sub-tab found.');
    }
  } else {
    console.log('No comments tab found.');
  }
}


async function run(reference: string) {
  console.log(`Starting search for reference: ${reference}`);
  
  const outDir = path.join(process.cwd(), 'downloads', reference.replace(/\//g, '-'));
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  // Some gov sites block non-standard user agents
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

    // Check if we got a list of results or a direct hit
    if (await page.locator('#searchResultsContainer').count() > 0) {
      // It's a list. Find the exact match.
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
    
    // We should now be on the application details page.
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Check if it's the details page
    if (!await page.locator('#applicationDetails').count() && !await page.locator('#simpleDetailsTable').count()) {
       console.log('Did not land on application details page. HTML:', await page.content());
       return;
    }

    // Save summary details
    const summary = await page.locator('#simpleDetailsTable').innerText();
    fs.writeFileSync(path.join(outDir, 'summary.txt'), summary);
    console.log('Saved summary.txt');

    await downloadDocuments(page, outDir);
    await scrapeComments(page, outDir);

    console.log(`Done! Files saved in ${outDir}`);

  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    await browser.close();
  }
}

const program = new Command();

program
  .name('planbrowser')
  .description('Download documents and comments for a Cambridgeshire planning application')

program
  .command('download')
  .description('Download documents for a specific reference (e.g. 24/02737/FUL)')
  .argument('<reference>', 'Planning application reference')
  .action((reference) => {
    run(reference);
  });

program
  .command('search')
  .description('Search for large planning applications near a postcode using PlanIt API')
  .argument('<postcode>', 'UK Postcode (e.g. CB1 2JW)')
  .option('-r, --radius <km>', 'Search radius in km', '2')
  .action(async (postcode, options) => {
    console.log(`Searching for applications near ${postcode} within ${options.radius}km...`);
    
    try {
      const res = await fetch(`https://www.planit.org.uk/api/applics/json?pcode=${encodeURIComponent(postcode)}&krad=${options.radius}&pg_sz=50`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) {
        throw new Error(`PlanIt API returned ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      
      if (!data || typeof data !== 'object' || !('records' in data) || !Array.isArray(data.records) || data.records.length === 0) {
        console.log('No applications found matching those criteria.');
        return;
      }

      console.log(`\nFound ${data.records.length} applications:\n`);
      data.records.forEach((app: unknown) => {
        if (app && typeof app === 'object') {
          const ref = 'uid' in app ? app.uid : 'Unknown';
          const auth = 'name' in app && typeof app.name === 'string' ? app.name.split('/')[0] : 'Unknown';
          const state = 'app_state' in app ? app.app_state : 'Unknown';
          const desc = 'description' in app ? app.description : 'Unknown';
          const url = 'url' in app ? app.url : 'Unknown';

          console.log(`Reference: ${ref}`);
          console.log(`Council:   ${auth}`);
          console.log(`Status:    ${state}`);
          console.log(`Desc:      ${desc}`);
          console.log(`Link:      ${url}`);
          console.log('-'.repeat(40));
        }
      });
      console.log(`\nTo download documents for any of these, run:\n  npx tsx src/index.ts download <reference>`);
    } catch (e) {
      console.error('Failed to search PlanIt API:', e);
    }
  });

program.parse();

