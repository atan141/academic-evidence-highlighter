# Academic Evidence Highlighter

A Chrome extension prototype for finding candidate evidence while reading research pages.

This version scans scholarly search results, visible article text, and accessible PDFs; highlights likely evidence sentences; creates review cards; and exports a CSV. It is intentionally conservative: every item is labeled as candidate evidence for human verification.

## Load It In Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Choose this folder:

   `/Users/annie./Documents/Codex/2026-06-04/my-claim-okay-i-have-a`

5. Open Google Scholar, another scholarly search page, an article abstract page, or an HTML full-text article.
6. Click the extension icon. On Scholar pages, it will try to fill the question/concepts from the search and scan automatically.

## What Works Now

- Tries to fill the research question and concepts from the current search page.
- Updates the research question/concepts when the active Google Scholar search query changes.
- Parses one-word and multi-word organism searches like `seagull food diet`, `black phoebe food diet`, and `what does seagull eat`.
- Adds guide mode for broad searches like `hamster care guide`, prioritizing practical care recommendations about housing, feeding, bedding, handling, hygiene, health, and veterinary care.
- Adds preview badges to visible Google Scholar results, based on high/medium candidate evidence found in each visible title/snippet.
- Guards the page script against duplicate injection when Chrome already loaded it.
- Keeps PDF parser fallback quiet so expected fallback behavior does not appear as an extension error.
- Detects reference/bibliography sections and labels those matches as `reference` instead of high/medium/low evidence.
- Remembers the research question, two concepts, and extra terms.
- Uses the research question to change the filter. For example, "what does pink flamingo eat?" prioritizes eating/food evidence and downranks diet-color sentences that do not answer the question.
- For food questions, checks that the sentence or nearby text is actually about the target organism, so food evidence for another species is penalized.
- Scans Google Scholar result snippets, article/full-text HTML pages, and tries the first accessible PDF link when page text has no matches.
- If an online PDF blocks extension access, use **Scan saved PDF** to scan a locally saved PDF file in the sidebar. Saved PDFs are parsed with bundled PDF.js first, with a rough parser as fallback.
- PDF results include page numbers. For accessible online PDF tabs, clicking a PDF result tries to jump Chrome's PDF viewer to that page; for saved local PDFs, the card shows the page number to inspect manually.
- Highlights candidate evidence sentences on the page when it can wrap the exact sentence.
- Extra-highlights extracted answer words inside the sentence, such as possible food items or relationship terms.
- Lets the sidebar sort results by paper order or highest compatibility, and filter by confidence. The default filter is **All except references**, with separate options for **References only** and **All including references**.
- Clicking a result card jumps to the matching highlight on the page when the result came from page text.
- Auto-clears stale results and scans the newly active page when you switch to a different research paper tab.
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

## Best Next Step

The most useful product path is:

1. Keep this sidebar workflow.
2. Build a PDF.js Evidence Reader that renders pages and highlights inside the extension, instead of only producing sidebar evidence cards.
3. Add optional AI extraction through a small backend, so API keys and paper text are handled safely.
4. Add project folders and deduped exports across many papers.
