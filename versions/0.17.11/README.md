# Academic Evidence Highlighter 0.17.11

Latest version snapshot. The previous finalized 0.16.3 snapshot remains available.

- `extension/`: source files for loading the unpacked extension in Chrome.
- `academic-evidence-highlighter-0.17.11.zip`: packaged extension ZIP for the Chrome Web Store release.
- `manifest.json`: repository-layout manifest for this snapshot.

## What changed in 0.17.11

- Adds a persistent note under Automatic scanning that explains scholarly-only page checks, the scope of Any page and manual scans (including visible email or chat messages), and scroll-triggered scans of newly loaded text.
- Includes the 0.17.10 pause/resume behavior: pausing clears current results and page highlights while preserving research settings; scans requested while paused ask before resuming; using Resume automatically scans the active eligible page.
