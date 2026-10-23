# Privacy Policy for Academic Evidence Highlighter

Effective date: October 23, 2026

Academic Evidence Highlighter is a Chrome extension that helps users find candidate evidence in scholarly search results, article pages, and PDFs. This policy explains what information the extension uses and how it handles that information.

## Summary

Academic Evidence Highlighter processes page text locally in the user's browser to provide its evidence-highlighting features. The extension does not sell user data, does not use user data for advertising, and does not send paper text, research questions, browsing activity, or PDF text to the developer's servers.

## Information the Extension Uses

The extension may use the following information when the user opens or scans a page:

- Page text from the active tab, such as article text, abstracts, visible search results, and citation/reference sections.
- For dynamic pages, visible text may be checked again after the user scrolls, and results from loaded sections are accumulated in memory for the current page and research settings.
- In scholarly-only mode, the page address is checked against known scholarly publisher domains and academic URL patterns before the page-reading script is loaded. If the address is not recognized, the page's content is not read unless the user explicitly chooses **Scan this page once**.
- PDF text from accessible online PDFs or from PDF files the user manually selects with **Scan saved PDF**.
- The active tab title and URL, used to label results and exports.
- The visible search field value or search query in the active page URL may be checked locally while the side panel is open on a page eligible for automatic scanning, so a newly selected page search can update the research question and concepts.
- User-entered research settings, including the research question, concept fields, extra terms, sort preference, and filter preference.
- Scroll events from a page where the page-reading script has been loaded, used to request another scan of newly loaded content when automatic scanning is enabled.
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

Academic Evidence Highlighter does not share user data with advertisers, analytics providers, data brokers, or other third parties.

The extension currently has no backend server and no external AI API connection. If a future version adds optional cloud or AI features, this policy should be updated before that version is published.

## Website and PDF Access

The page-reading script is not loaded on every website. In **Scholarly pages only** mode, the extension first checks the active tab's address locally; only recognized scholarly publisher domains and academic URL patterns are eligible for automatic scanning. For an unrecognized address, the extension does not load its page-reading script, inspect page text or search fields, or request scroll scans. The side panel offers a one-time scan that runs only if the user chooses it. In **Any page** mode, the active page's loaded text may be scanned automatically. Users can pause automatic scanning or choose manual-only scanning. The extension does not bypass paywalls, subscriptions, publisher access controls, or DRM. Infinite feeds only expose content after the site loads it; users may need to scroll to load more.

When the extension attempts to fetch an accessible PDF link, the browser may include the user's existing site cookies or login session for that request. The extension does not read, store, or transmit those cookies.

## User Control

Users can:

- Edit or clear research settings in the side panel.
- Use **Clear all** to clear fields, results, and page highlights.
- Each open tab restores its own research question and concepts when you return to it; **Clear all** clears those fields for the current tab.
- Pause automatic scanning in the side panel, use manual-only mode, or choose which pages are scanned.
- Use **Scan this page once** to scan a single page while paused.
- Remove the extension from Chrome at any time.

## Limited Use Statement

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

For privacy questions, contact the developer through the support contact listed on the Chrome Web Store listing.
