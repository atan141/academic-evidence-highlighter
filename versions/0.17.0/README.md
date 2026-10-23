# Academic Evidence Highlighter

A Chrome extension prototype for finding candidate evidence while reading research pages.

Version 0.17.0 scans scholarly search results, visible article text, and accessible PDFs; highlights likely evidence sentences; creates review cards; and exports a CSV. Automatic scanning defaults to scholarly pages only, and you can pause it at any time without clearing your research question. It is intentionally conservative: every item is labeled as candidate evidence for human verification.

## Load It In Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Choose this folder:

   `versions/0.17.0`

5. Open Google Scholar, another scholarly search page, an article abstract page, or an HTML full-text article.
6. Click the extension icon. On scholarly pages, it can fill the question/concepts from the search and scan automatically. Use **Pause scanning** to stop automatic scans while keeping your question. While paused, **Scan this page once** scans only the current page.

## What Works Now

- Tries to fill the research question and concepts from the current search page.
- Updates the research question/concepts when the active Google Scholar search query changes.
- Parses one-word and multi-word organism searches like `seagull food diet`, `black phoebe food diet`, and `what does seagull eat`.
- Adds guide mode for broad searches like `hamster care guide`, prioritizing practical care recommendations about housing, feeding, bedding, handling, hygiene, health, and veterinary care.
- Guards the page script against duplicate injection when Chrome already loaded it.
- Keeps PDF parser fallback quiet so expected fallback behavior does not appear as an extension error.
- Detects reference/bibliography sections and labels those matches as `reference` instead of high/medium/low evidence.
- Remembers the research question, two concepts, and extra terms.
- Uses the research question to change the filter. For example, "what does pink flamingo eat?" prioritizes eating/food evidence and downranks diet-color sentences that do not answer the question.
- For food questions, checks that the sentence or nearby text is actually about the target organism, so food evidence for another species is penalized.
- Scans article/full-text HTML pages, visible page text, and tries the first accessible PDF link when page text has no matches.
- If an online PDF blocks extension access, use **Scan saved PDF** to scan a locally saved PDF file in the sidebar. Saved PDFs are parsed with bundled PDF.js first, with a rough parser as fallback.
- PDF results include page numbers. For accessible online PDF tabs, clicking a PDF result tries to jump Chrome's PDF viewer to that page; for saved local PDFs, the card shows the page number to inspect manually.
- Highlights candidate evidence sentences on the page when it can wrap the exact sentence.
- Extra-highlights extracted answer words inside the sentence, such as possible food items or relationship terms.
- Lets the sidebar sort results by paper order or highest compatibility, and filter by confidence. The default filter is **All except references**, with separate options for **References only** and **All including references**.
- Clicking a result card jumps to the matching highlight on the page when the result came from page text.
- Auto-clears stale results and scans the newly active page when you switch to a different research paper tab.
- Starts in **Scholarly pages only** automatic scanning mode. Change it to **Any page** or **Only when I click Scan** in the side panel.
- Provides a visible **Pause scanning** control, a paused toolbar badge, and the `Alt+Shift+P` keyboard shortcut. Pausing removes current page highlights but keeps the saved research question and concepts.
- Loads the page-reading script only when automatic scanning is allowed or you explicitly scan, rather than injecting it into every website on browser startup.
- Remembers sidebar sort/filter preferences, such as Highest compatibility, across tabs and reloads.
- **Clear all** clears the search fields, results, and page highlights.
- Creates sidebar cards with:
  - one-sentence summary
  - concepts
  - evidence type
  - confidence
  - exact sentence
- Exports a CSV table for later checking.

## Important Limitation

Chrome's built-in PDF viewer and embedded site viewers such as JSTOR are protected or iframe-heavy, so normal content scripts cannot reliably draw highlights inside every PDF the same way they can highlight article HTML pages. This prototype now tries to fetch direct/accessible PDF links and extract text for evidence cards. If a publisher returns `403`, the browser can display the PDF but the extension is blocked from fetching it directly; use **Scan saved PDF** as the fallback. Scanned image PDFs and encrypted PDFs may still fail because there is no selectable text to extract.

## Policy Documents

- `PRIVACY.md` explains what information the extension uses and how it is handled.
- `TERMS.md` explains candidate-evidence limits, user responsibilities, and copyright/paywall expectations.
- `DATA_USAGE.md` contains Chrome Web Store privacy-form notes and permission justifications.
- `SUBMISSION_CHECKLIST.md` contains upload and listing text suggestions.
- `MAINTENANCE_CHECKLIST.md` is the required review checklist for future code, privacy, policy, and release changes.

Current submitted public privacy policy URL:

`https://docs.google.com/document/d/1-CyYBNFgZTvN7RcAJ7G5qynrXcyXUMSCYMdSgZMPfEs/edit?usp=sharing`

## Best Next Step

The most useful product path is:

1. Keep this sidebar workflow.
2. Build a PDF.js Evidence Reader that renders pages and highlights inside the extension, instead of only producing sidebar evidence cards.
3. Add optional AI extraction through a small backend, so API keys and paper text are handled safely.
4. Add project folders and deduped exports across many papers.
