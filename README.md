# planbrowser

A CLI tool to search for and download documents for Cambridgeshire planning applications.

## Usage

You can run the CLI using `npx tsx src/index.ts` (or build/install it).

### Search

Search for large planning applications near a UK postcode using the PlanIt API:

```bash
npx tsx src/index.ts search "CB1 2JW"
```
Options:
* `-r, --radius <km>`: Search radius in km (default: 2)

### Download

Download documents and comments for a specific planning application reference:

```bash
npx tsx src/index.ts download 24/02737/FUL
```

## Dependencies
- [Playwright](https://playwright.dev/) for headless browser automation
- [Commander](https://github.com/tj/commander.js/) for the CLI interface
- [AdmZip](https://github.com/cthackers/adm-zip) for handling document archives

## Acknowledgements
This tool uses the [PlanIt API](https://www.planit.org.uk/) to search for planning applications.
