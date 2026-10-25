# Privacy Policy for Academic Evidence Highlighter

Effective date: October 25, 2026

Academic Evidence Highlighter is a Chrome extension that helps users find candidate evidence in scholarly search results, article pages, and PDFs. This policy explains what information the extension uses and how it handles that information.

## Summary

Academic Evidence Highlighter processes page text locally in the user's browser to provide its evidence-highlighting features. The extension does not sell user data, does not use user data for advertising, and does not send paper text, research questions, browsing activity, or PDF text to the developer's servers.

## Information the Extension Uses

The extension may use the following information when the user opens or scans a page:

- Page text from the active tab, such as article text, abstracts, visible search results, and citation/reference sections.
- For dynamic pages where scanning is allowed, scroll events can trigger another local check of newly loaded visible text. Results from loaded sections are accumulated in memory for the current page and research settings.
- In scholarly-only mode, the page address is checked against known scholarly publisher domains and academic URL patterns before the page-reading script is loaded. If the address is not recognized, the page's content is not read unless the user explicitly chooses **Scan this page once**.
- PDF text from accessible online PDFs or from PDF files the user manually selects with **Scan saved PDF**.
- The active tab title and URL, used to label results and exports.
- The visible search field value or search query in the active page URL may be checked locally while the side panel is open on a page eligible for automatic scanning, so a newly selected page search can update the research question and concepts.
- User-entered research settings, including the research question, concept fields, extra terms, sort preference, and filter preference.
- Scroll events from a page where the page-reading script has been loaded, used only to request another scan of newly loaded content when automatic scanning is enabled. Scroll events are not logged or sent to the developer.
- Scan mode, pause state, and whether the one-time version 0.17.0 notice was dismissed.
- Candidate evidence results generated from the current page or PDF.
- A separate set of research fields for each open tab, held in Chrome session storage so switching tabs restores that tab's question and concepts. This tab-to-settings map is cleared when a tab closes or the browser session ends.

## How the Information Is Used

This information is used only to provide and improve the extension's single purpose: helping users identify candidate evidence in research materials for human review.

Specifically, the extension uses page/PDF text to:

- Find sentences that may relate to the user's research question.
- Highlight candidate evidence on readable web pages.
- Show evidence cards in the side panel.
- Export a CSV file when the user chooses to export results.
- Detect references/bibliographies so those results can be labeled separately.

## Language

The side panel interface is available in English, Simplified Chinese, Japanese, and Spanish. Chrome selects the interface language from the browser's language setting; other languages fall back to English. Interface translations are bundled files inside the extension — no text is sent to a translation service, and no new information is collected for language support. The paper's sentences, the user's research question and concepts, and matched terms are never translated. Field example prompts stay in English because matching works on English input. Language selection is a browser setting, not information stored by the extension.

## Storage

The extension uses Chrome storage to remember:

- Research question
- Concept 1
- Concept 2
- Extra terms
- Sort preference
- Filter preference
- Automatic scan mode
- Pause state
- One-time version notice dismissal state

Chrome Sync stores the current research fields and interface settings. Separately, Chrome session storage maps each open tab to its own research question, concepts, and extra terms so switching tabs restores that tab's context. The tab map is memory-only and is cleared when a tab closes or the browser session ends. Depending on the user's Chrome settings, the current field values may sync across signed-in Chrome browsers; the developer does not receive this stored information.

Candidate evidence results are kept in the extension side panel and in memory in the current page while the user is working, so results from content loaded during scrolling can be accumulated. They are not uploaded to the developer. CSV files are created only when the user clicks **Export CSV**.

## Sharing and Selling Data

Academic Evidence Highlighter does not sell user data.

The extension does not send page text, PDF text, research questions, or generated results to the developer or to advertising, analytics, data-broker, or AI services. Research fields and interface preferences are stored through Chrome Storage Sync, which may sync them across the user's signed-in Chrome browsers according to Chrome's sync settings. The developer does not receive those synced values.

The extension currently has no backend server and no external AI API connection. If a future version adds optional cloud or AI features, this policy should be updated before that version is published.

## Website and PDF Access

The page-reading script is not loaded on every website. In **Scholarly pages only** mode, the extension first checks the active tab's address locally; only recognized scholarly publisher domains and academic URL patterns are eligible for automatic scanning. For an unrecognized address, the extension does not load its page-reading script, inspect page text or search fields, or request scroll scans. The side panel offers a one-time scan that runs only if the user chooses it. In **Any page** mode, visible text on the active page may be scanned automatically; this may include personal communications displayed on a page the user has chosen to scan, such as email or chat messages. **Only when I click Scan** waits for a manual scan action. On pages where automatic scanning is allowed, scrolling can trigger scans of newly loaded visible text. Users can pause automatic scanning. The extension does not bypass paywalls, subscriptions, publisher access controls, or DRM. Infinite feeds only expose content after the site loads it; users may need to scroll to load more.

When the extension attempts to fetch an accessible PDF link, the browser may include the user's existing site cookies or login session for that request. The extension does not read, store, or transmit those cookies.

## User Control

Users can:

- Edit or clear research settings in the side panel.
- Use **Clear all** to clear fields, results, and page highlights.
- Each open tab restores its own research question and concepts when you return to it; **Clear all** clears those fields for the current tab.
- Pause automatic scanning in the side panel, use manual-only mode, or choose which pages are scanned. Pausing clears current results and page highlights from open tabs while keeping the research settings. If the user starts a scan while paused, the extension asks before turning pause off; resuming scans the active eligible page.
- If a user starts a page or saved-PDF scan while paused, the extension asks before turning pause off; confirming **Resume and scan** resumes scanning and proceeds. Resuming from the pause button scans the active eligible page automatically.
- Remove the extension from Chrome at any time.

## Limited Use Statement

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

For privacy questions, contact the developer through the support contact listed on the Chrome Web Store listing.
