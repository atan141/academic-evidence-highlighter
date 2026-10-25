# Chrome Web Store Submission Checklist

Use this checklist before publishing Academic Evidence Highlighter.

## Before Uploading

- Confirm the uploaded ZIP has `manifest.json` at its root (zip the extension folder's contents, not the folder itself).
- Confirm the version in `extension/manifest.json` is the version being uploaded.
- Reload the unpacked extension in `chrome://extensions`.
- Test the side panel on:
  - A Google Scholar search page
  - An article HTML page
  - An accessible PDF URL
  - A saved PDF with **Scan saved PDF**
- Test a history/autocomplete search selection without pressing Enter and confirm the research fields update after the selected query settles.
- Test a long or infinite-scroll page, confirming newly loaded content is scanned and earlier results return after switching tabs and back without reloading the page.
- Confirm switching between an apple research tab and a separate avocado search tab restores each tab's own question and concepts.
- On a long-abstract journal page, confirm article findings are scanned and references remain separately labeled.
- Confirm Facebook, Messenger, Gmail, and YouTube are not read or scanned in **Scholarly pages only** mode; in **Any page** mode, YouTube search-title matches are labeled as titles and not evidence.
- Confirm no old search-result preview badges appear on Scholar results.
- Confirm **Clear all** clears fields, results, and page highlights.
- Confirm CSV export works.
- Confirm the side panel loads without an invalid-locale error in English, Chinese, Japanese, and Spanish (switch Chrome's language and relaunch).
- Confirm no numbered placeholder sits directly next to another placeholder in any `_locales/*/messages.json` (adjacent placeholders break Chrome's locale loading).
- Confirm field example prompts stay in English in all locales.
- Confirm card tags render translated while filtering, sorting, and CSV values still use the English values.
- Confirm an unsupported language (for example Italian) falls back to English.

## Privacy and Policy

- Add a privacy policy URL in the Chrome Web Store Developer Dashboard.
- Current submitted privacy policy URL: `https://docs.google.com/document/d/1-CyYBNFgZTvN7RcAJ7G5qynrXcyXUMSCYMdSgZMPfEs/edit?usp=sharing`
- Make sure the privacy policy matches the extension behavior.
- Make sure the public Google Doc privacy policy matches `PRIVACY.md` before submitting a new version.
- Use the same data disclosures in the dashboard and in `DATA_USAGE.md`.
- In the Privacy dashboard, disclose website content, personal communications, and scroll activity when the current build can process them; explain that personal communications are only processed on a page the user chose through **Any page** or a manual scan, and that scroll is a local trigger for scanning newly loaded text.
- Confirm the `activeTab`, `scripting`, and host permission justifications describe eligibility-gated automatic scans, manual scans, pause behavior, and the scholarly-only URL check.
- Review `MAINTENANCE_CHECKLIST.md` before every release or code update.
- Do not claim the extension gives final answers. Use "candidate evidence" language.
- Do not claim affiliation with Google Scholar, Google, JSTOR, publishers, universities, or databases.
- Do not claim the extension bypasses paywalls or gives access to locked papers.

## Suggested Short Description

Highlight evidence sentences in research papers and PDFs from your question and concepts — private, nothing sent to the developer.

## Suggested Detailed Description

Too much to read? Ask a question, and let the page answer with evidence.

Academic Evidence Highlighter helps researchers and students review research papers and PDFs. Enter a research question and target concepts, and it highlights likely evidence sentences on the page, shows review cards in the side panel, labels references separately, and exports candidate results to CSV. Every result is candidate evidence for human verification — you decide what counts.

You stay in control. Pause clears results and highlights while keeping your settings. Three scan modes: Scholarly (the default), All, and Manual. In Scholarly mode, only scholarly pages are read — the page-reading script is not even loaded on other pages. Unrecognized pages are not read unless you choose Scan this page once. In All mode, the extension can scan visible text on any page you choose, including personal communications displayed there. In Manual mode, nothing scans until you click Scan. Scrolling a scholarly page can scan newly loaded text as it appears.

The panel speaks your language. The interface is available in English, Simplified Chinese, Japanese, and Spanish, and follows your Chrome language setting; other languages show English. Your question, concepts, and the paper's own sentences are never translated — only the extension's buttons, instructions, labels, and summary templates change language. Example prompts in the fields stay in English, because matching works on English input.

Everything is processed locally on your device. Page and PDF text are not sent to the developer, and there is no account or sign-up. Your research settings and interface preferences use Chrome Storage Sync and may sync according to your Chrome settings.

Built for research, but in All or Manual mode the same question-driven scanning works on any long page.

## Suggested Permission Explanation

Academic Evidence Highlighter checks the active tab address locally in scholarly-only mode and reads page content only after the address is recognized or the user explicitly chooses to scan that page. Any page mode may process visible text, including personal communications displayed on the page the user chooses; scrolling on eligible pages triggers scans of newly loaded text. Page/PDF text and results stay local. Research fields and interface preferences use Chrome Storage Sync and may sync according to the user's Chrome settings. The extension does not sell data, serve ads, or send page text to the developer.

## Suggested Category

Productivity or Search Tools.

## Support Contact

Use an email address that you are comfortable showing in the Chrome Web Store listing.

## Support URL

A Google Form is acceptable for the initial support URL. Keep it short, avoid file uploads, and ask users not to paste private, sensitive, copyrighted, or confidential content.
