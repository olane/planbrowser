# planbrowser

A tool to search for and download documents for Cambridgeshire planning applications, with a web UI (Vue) and an API backend to search, download, and view applications in your browser.

## Usage

1. Start the API server:
   ```bash
   npm run server
   ```
2. Start the web frontend (in a separate terminal):
   ```bash
   cd ui
   npm run dev
   ```
3. Open the displayed local URL (e.g. `http://localhost:5173`) in your browser.

## Dependencies
- [Playwright](https://playwright.dev/) for headless browser automation
- [Commander](https://github.com/tj/commander.js/) for the CLI interface
- [AdmZip](https://github.com/cthackers/adm-zip) for handling document archives

## Acknowledgements
This tool uses the [PlanIt API](https://www.planit.org.uk/) to search for planning applications.
