# Data Usage Disclosure

This document is written to help complete the Chrome Web Store privacy and data usage forms for Academic Evidence Highlighter.

Current submitted public privacy policy URL:

`https://docs.google.com/document/d/1-CyYBNFgZTvN7RcAJ7G5qynrXcyXUMSCYMdSgZMPfEs/edit?usp=sharing`

## Single Purpose

Academic Evidence Highlighter helps users find and review candidate evidence in scholarly search results, article pages, and PDFs.

## Data the Extension Uses

The extension uses the following data only for the user-facing evidence-highlighting feature:

- Active tab URL and title
- Active tab address checked locally against known scholarly publishers and academic URL patterns in scholarly-only mode
- Visible page text from the active tab
- Accessible PDF text
- PDF files manually selected by the user
- User-entered research question, concepts, and extra terms
- Scroll events from the active page, used to request scans of newly loaded content when automatic scanning is enabled
- Search input values and URL query terms on the active page, used locally to update the research fields after a search changes
- User interface preferences such as sort and filter choices
- Generated candidate evidence cards and CSV export content
- Per-tab research questions, concepts, and extra terms held in Chrome session storage and removed when tabs close or the browser session ends

## Data the Extension Stores

Stored with Chrome storage:

- Research question
- Concept 1
- Concept 2
- Extra terms
- Sort preference
- Filter preference
- Automatic scan mode
- Pause state
- One-time version notice dismissal state

The active research fields are also associated with their open tab in Chrome session storage. This lets the side panel restore each tab's question and concepts without keeping a persistent results database.

Kept only in extension memory while the page remains open unless exported by the user:

- Candidate evidence results
- Extracted answer terms
- Short generated summaries
- Page/PDF result metadata
- Accumulated candidate results for the active page and current research settings, kept in memory while the page remains open

Pausing scanning clears current results and page highlights from open tabs. Research settings remain saved. If the user starts a scan while paused, the extension asks before turning pause off; resuming also scans the active eligible page.

## Data the Extension Does Not Collect

The extension does not collect, sell, or transmit:

- Names
- Email addresses
- Passwords
- Payment information
- Health information
- Precise location
- Authentication credentials
- Complete browsing history
- Analytics events
- Advertising identifiers
- Paper text or PDF text to the developer's server

## Third-Party Sharing

No user data is shared with third parties by this version of the extension.

This version has no backend server, no analytics, no advertising SDK, and no external AI API call.

## Permission Justifications

### `activeTab`

Used to scan the active tab when an eligible automatic-scan mode is enabled, including after active-page scrolling, or when the user starts a scan.

### `scripting`

Used to inject the page-reading script only after a page is eligible for automatic scanning or when the user explicitly starts a scan. In scholarly-only mode, the extension checks the URL before injection and does not inspect page text or search fields on unrecognized pages.

### `storage`

Used to remember the user's research question, concepts, extra terms, sort setting, and filter setting.

### `sidePanel`

Used to show the Evidence Finder interface in Chrome's side panel.

### `<all_urls>` host permission

Used to support research pages on many domains. The extension does not load its page-reading script on every page. In scholarly-only mode, it checks the active tab URL first and only injects on recognized scholarly addresses; on an unrecognized page it does not read page content unless the user explicitly chooses **Scan this page once**. It does not use this access for advertising, tracking, or selling data.

## Chrome Web Store Privacy Form Suggested Answers

Use these only if they match the final version being uploaded.

### Does the extension collect or use user data?

Yes, it processes website content and user-provided research settings locally to provide the evidence-highlighting feature.

### Is user data sold?

No.

### Is user data used or transferred for purposes unrelated to the extension's single purpose?

No.

### Is user data used for advertising or creditworthiness?

No.

### Is user data shared with third parties?

No.

### Does the extension collect web browsing activity?

The extension accesses the active tab's URL, title, and visible content only to scan the page the user is viewing. It does not track browsing history across sites and does not transmit browsing activity to the developer.

### Does the extension use remote code?

No. The extension uses bundled extension files, including bundled PDF.js files, and does not load executable code from a remote server.

## Limited Use Statement

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.
