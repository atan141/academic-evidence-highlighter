# Privacy Policy for Academic Evidence Highlighter

Effective date: June 4, 2026

Academic Evidence Highlighter is a Chrome extension that helps users find candidate evidence in scholarly search results, article pages, and PDFs. This policy explains what information the extension uses and how it handles that information.

## Summary

Academic Evidence Highlighter processes page text locally in the user's browser to provide its evidence-highlighting features. The extension does not sell user data, does not use user data for advertising, and does not send paper text, research questions, browsing activity, or PDF text to the developer's servers.

## Information the Extension Uses

The extension may use the following information when the user opens or scans a page:

- Page text from the active tab, such as article text, abstracts, visible search results, and citation/reference sections.
- For dynamic pages, visible text may be checked again after the user scrolls, and results from loaded sections are accumulated in memory for the current page and research settings.
- In scholarly-only mode, citation metadata and scholarly structured-data tags from the active page may be checked locally to decide whether it looks like a research article. Full page text is not scanned unless the page passes that check or the user explicitly chooses **Scan page**.
- PDF text from accessible online PDFs or from PDF files the user manually selects with **Scan saved PDF**.
- The active tab title and URL, used to label results and exports.
- The visible search field value or search query in the active page URL may be checked locally while the side panel is open, so a newly selected page search can update the research question and concepts.
- User-entered research settings, including the research question, concept fields, extra terms, sort preference, and filter preference.
- Scroll events from the active page, used to request another scan of newly loaded content when automatic scanning is enabled.
- Scan mode, pause state, and whether the one-time version 0.17.0 notice was dismissed.
- Candidate evidence results generated from the current page or PDF.

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

This storage is used so users do not have to re-enter the same settings on every tab. Depending on the user's Chrome settings, Chrome may sync this information across the user's signed-in Chrome browsers. The developer does not receive this stored information.

Candidate evidence results are kept in the extension side panel and in memory in the current page while the user is working, so results from content loaded during scrolling can be accumulated. They are not uploaded to the developer. CSV files are created only when the user clicks **Export CSV**.

## Sharing and Selling Data

Academic Evidence Highlighter does not sell user data.

Academic Evidence Highlighter does not share user data with advertisers, analytics providers, data brokers, or other third parties.

The extension currently has no backend server and no external AI API connection. If a future version adds optional cloud or AI features, this policy should be updated before that version is published.

## Website and PDF Access

The extension's content script is available on websites covered by the host permission so it can respond promptly when the user scans. Its presence does not itself read page text. Automatic scanning defaults to scholarly pages only. In scholarly-only mode, citation metadata is checked locally before page text is read; in **Any page** mode, the active page's loaded text may be scanned automatically. The extension may also read the active page's search query locally while the side panel is open and request scans as the user scrolls. Users can pause automatic scanning or choose manual-only scanning. The extension does not bypass paywalls, subscriptions, publisher access controls, or DRM. Infinite feeds only expose content after the site loads it; users may need to scroll to load more.

When the extension attempts to fetch an accessible PDF link, the browser may include the user's existing site cookies or login session for that request. The extension does not read, store, or transmit those cookies.

## User Control

Users can:

- Edit or clear research settings in the side panel.
- Use **Clear all** to clear fields, results, and page highlights.
- Pause automatic scanning in the side panel, use manual-only mode, or choose which pages are scanned.
- Use **Scan this page once** to scan a single page while paused.
- Remove the extension from Chrome at any time.

## Limited Use Statement

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

For privacy questions, contact the developer through the support contact listed on the Chrome Web Store listing.
