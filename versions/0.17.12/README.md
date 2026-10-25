# Academic Evidence Highlighter 0.17.12

Latest version snapshot. The previous finalized 0.17.11 snapshot remains available.

- `extension/`: source files for loading the unpacked extension in Chrome.
- `academic-evidence-highlighter-0.17.12.zip`: packaged extension ZIP for the Chrome Web Store release.
- `manifest.json`: repository-layout manifest for this snapshot.

## What changed in 0.17.12

- Adds interface translations in Simplified Chinese, Japanese, and Spanish (English remains the default). The side panel follows the browser's Chrome language setting; unsupported languages fall back to English.
- Translates interface words, card tags, and summary templates only. The paper's sentences, the user's question and concepts, and matched terms are never translated, and field example prompts stay in English because matching works on English input.
- No permission, storage, or data-handling changes. Translations are bundled files; no text is sent to a translation service.
