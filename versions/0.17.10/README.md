# Academic Evidence Highlighter 0.17.10

Release snapshot for the current Chrome Web Store submission. The original finalized 0.16.3 snapshot remains available.

- `extension/`: source files for loading the unpacked extension in Chrome.
- `academic-evidence-highlighter-0.17.10.zip`: packaged extension uploaded for Web Store review.
- `manifest.json`: repository-layout manifest for this snapshot.

## What changed in 0.17.10

- Pausing clears current results and page highlights while preserving research settings.
- Starting a page or saved-PDF scan while paused asks before resuming; confirming resumes and scans, and using Resume automatically scans the active eligible page.
- The scholarly-only default checks the URL before loading the page-reading script. Any page mode can process visible text on the page the user chooses, including personal communications displayed there. Scroll events on eligible pages can trigger scans of newly loaded text.
