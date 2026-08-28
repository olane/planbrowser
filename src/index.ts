import { Command } from 'commander';
import { downloadApplication, searchPlanIt } from './scraper.js';
import type { PlanItResponse, PlanItRecord, SearchFilters } from './types.js';

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
  .option('--search <text>', 'Keyword search on description/type/status/decision')
  .option('--developer <text>', 'Search applicant/agent company or address')
  .option('--app-type <types>', 'Application type(s), comma separated (e.g. Full,Heritage,Trees)')
  .option('--app-state <states>', 'Decision status(es), comma separated (e.g. Permitted,Rejected,Withdrawn)')
  .option('--app-size <sizes>', 'Development size(s), comma separated (e.g. Large,Medium,Small)')
  .option('--recent <days>', 'Only applications started within this many days (0 = today)')
  .option('--start-date <date>', 'Only applications started on/after this date (YYYY-MM-DD)')
  .option('--end-date <date>', 'Only applications started on/before this date (YYYY-MM-DD)')
  .option('--changed <days>', 'Only applications last changed within this many days (0 = today)')
  .option('--changed-start <date>', 'Only applications last changed on/after this date (YYYY-MM-DD)')
  .option('--changed-end <date>', 'Only applications last changed on/before this date (YYYY-MM-DD)')
  .option('--decided <days>', 'Only applications decided within this many days (0 = today)')
  .option('--decided-start <date>', 'Only applications decided on/after this date (YYYY-MM-DD)')
  .option('--decided-end <date>', 'Only applications decided on/before this date (YYYY-MM-DD)')
  .option('--different <days>', 'Only applications with different data within this many days (0 = today)')
  .option('--different-start <date>', 'Only applications with different data on/after this date (YYYY-MM-DD)')
  .option('--different-end <date>', 'Only applications with different data on/before this date (YYYY-MM-DD)')
  .action(async (postcode, options) => {
    console.log(`Searching for applications near ${postcode} within ${options.radius}km...`);
    try {
      const filterMap: Record<string, string | undefined> = {
        search: options.search,
        developer: options.developer,
        app_type: options.appType,
        app_state: options.appState,
        app_size: options.appSize,
        recent: options.recent,
        start_date: options.startDate,
        end_date: options.endDate,
        changed: options.changed,
        changed_start: options.changedStart,
        changed_end: options.changedEnd,
        decided: options.decided,
        decided_start: options.decidedStart,
        decided_end: options.decidedEnd,
        different: options.different,
        different_start: options.differentStart,
        different_end: options.differentEnd
      };
      const filters: SearchFilters = {};
      for (const [key, value] of Object.entries(filterMap)) {
        if (value) {
          (filters as Record<string, string>)[key] = value;
        }
      }
      const data: PlanItResponse = await searchPlanIt(postcode, options.radius, filters);
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
          const date = app.start_date || 'Unknown';
          console.log(`Reference: ${ref}`);
          console.log(`Council:   ${auth}`);
          console.log(`Status:    ${state}`);
          console.log(`Date:      ${date}`);
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

