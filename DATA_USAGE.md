# Data Usage Disclosure

This document is written to help complete the Chrome Web Store privacy and data usage forms for Academic Evidence Highlighter.

Current submitted public privacy policy URL:

`https://docs.google.com/document/d/1-CyYBNFgZTvN7RcAJ7G5qynrXcyXUMSCYMdSgZMPfEs/edit?usp=sharing`

## Single Purpose

Academic Evidence Highlighter helps users find and review candidate evidence in scholarly search results, article pages, and PDFs.

## Data the Extension Uses

The extension uses the following data only for the user-facing evidence-highlighting feature:

- Active tab URL and title
- Citation metadata and scholarly structured-data tags checked locally in scholarly-only mode
- Visible page text from the active tab
- Accessible PDF text
- PDF files manually selected by the user
- User-entered research question, concepts, and extra terms
- User interface preferences such as sort and filter choices
- Generated candidate evidence cards and CSV export content

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

Stored only in the current side panel session unless exported by the user:

- Candidate evidence results
- Extracted answer terms
- Short generated summaries
- Page/PDF result metadata

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

Used to scan the current tab only when the user opens the extension or starts scanning.

### `scripting`

Used to check active-page citation metadata in scholarly-only mode and to inject or re-inject the content script into the active page when a page is eligible for scanning or the user explicitly starts a scan.

### `storage`

Used to remember the user's research question, concepts, extra terms, sort setting, and filter setting.

### `sidePanel`

Used to show the Evidence Finder interface in Chrome's side panel.

### `<all_urls>` host permission

Used because academic research pages and PDFs can appear on many different publisher, university, database, and search-result domains. The extension needs page access to read the current page/PDF for the evidence-highlighting feature. It does not use this access for advertising, tracking, or selling data.

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
