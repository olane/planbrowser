import { Command } from 'commander';
import { downloadApplication, searchPlanIt } from './scraper.js';

const program = new Command();

program
  .name('planbrowser')
  .description('Download documents and comments for a Cambridgeshire planning application')

program
  .command('download')
  .description('Download documents for a specific reference (e.g. 24/02737/FUL)')
  .argument('<reference>', 'Planning application reference')
  .action((reference) => {
    downloadApplication(reference);
  });

program
  .command('search')
  .description('Search for large planning applications near a postcode using PlanIt API')
  .argument('<postcode>', 'UK Postcode (e.g. CB1 2JW)')
  .option('-r, --radius <km>', 'Search radius in km', '2')
  .action(async (postcode, options) => {
    console.log(`Searching for applications near ${postcode} within ${options.radius}km...`);
    try {
      const data = await searchPlanIt(postcode, options.radius);
      if (!data || typeof data !== 'object' || !('records' in data) || !Array.isArray(data.records) || data.records.length === 0) {
        console.log('No applications found matching those criteria.');
        return;
      }
      console.log(`\nFound ${data.records.length} applications:\n`);
      data.records.forEach((app: any) => {
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

