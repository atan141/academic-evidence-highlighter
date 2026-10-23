# Chrome Web Store Submission Checklist

Use this checklist before publishing Academic Evidence Highlighter.

## Before Uploading

- Confirm the uploaded ZIP contains `extension/manifest.json`.
- Confirm the version in `extension/manifest.json` is the version being uploaded.
- Reload the unpacked extension in `chrome://extensions`.
- Test the side panel on:
  - A Google Scholar search page
  - An article HTML page
  - An accessible PDF URL
  - A saved PDF with **Scan saved PDF**
- Confirm no old search-result preview badges appear on Scholar results.
- Confirm **Clear all** clears fields, results, and page highlights.
- Confirm CSV export works.

## Privacy and Policy

- Add a privacy policy URL in the Chrome Web Store Developer Dashboard.
- Current submitted privacy policy URL: `https://docs.google.com/document/d/1-CyYBNFgZTvN7RcAJ7G5qynrXcyXUMSCYMdSgZMPfEs/edit?usp=sharing`
- Make sure the privacy policy matches the extension behavior.
- Make sure the public Google Doc privacy policy matches `PRIVACY.md` before submitting a new version.
- Use the same data disclosures in the dashboard and in `DATA_USAGE.md`.
- Review `MAINTENANCE_CHECKLIST.md` before every release or code update.
- Do not claim the extension gives final answers. Use "candidate evidence" language.
- Do not claim affiliation with Google Scholar, Google, JSTOR, publishers, universities, or databases.
- Do not claim the extension bypasses paywalls or gives access to locked papers.

## Suggested Short Description

Review candidate evidence in scholarly search results, article pages, and PDFs.

## Suggested Detailed Description

Academic Evidence Highlighter helps researchers, students, and readers quickly find candidate evidence in academic materials.

Enter a research question or target concepts, then scan the current page or PDF. Automatic scanning defaults to scholarly pages only, and users can pause it or choose manual-only scanning. The extension highlights likely evidence sentences, shows short review cards in the side panel, labels references separately, and can export candidate results to CSV.

Every result is candidate evidence for human verification. The extension is intended to speed up review, not replace careful reading or citation checking.

This version runs locally in the browser. It does not send paper text, PDF text, or research questions to a developer server.

## Suggested Permission Explanation

Academic Evidence Highlighter needs access to page content to scan pages selected by the user's automatic scanning mode or when the user explicitly clicks Scan page. It uses storage to remember the user's search settings, scan mode, pause state, and sidebar preferences. It does not sell data, serve ads, or transmit paper text to a developer server.

## Suggested Category

Productivity or Search Tools.

## Support Contact

Use an email address that you are comfortable showing in the Chrome Web Store listing.

## Support URL

A Google Form is acceptable for the initial support URL. Keep it short, avoid file uploads, and ask users not to paste private, sensitive, copyrighted, or confidential content.
