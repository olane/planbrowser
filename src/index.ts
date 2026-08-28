import { Command } from 'commander';
import { downloadApplication, searchPlanIt } from './scraper.js';
import type { PlanItResponse, PlanItRecord } from './types.js';

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
      const data: PlanItResponse = await searchPlanIt(postcode, options.radius);
      if (!data || !data.records || data.records.length === 0) {
        console.log('No applications found matching those criteria.');
        return;
      }
      console.log(`\nFound ${data.records.length} applications:\n`);
      data.records.forEach((app: PlanItRecord) => {
        if (app && typeof app === 'object') {
          const ref = app.uid || 'Unknown';
          const auth = app.name ? app.name.split('/')[0] : 'Unknown';
          const state = app.app_state || 'Unknown';
          const desc = app.description || 'Unknown';
          const url = app.url || 'Unknown';
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

