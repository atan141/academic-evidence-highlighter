# Maintenance Checklist

Use this checklist every time the extension code, permissions, data behavior, UI claims, or release version changes.

## Before Editing

- Identify whether the change affects:
  - Website/page text access
  - PDF access or parsing
  - Chrome permissions
  - Storage behavior
  - Exported CSV data
  - User-entered research settings
  - Any external network request, backend, AI API, analytics, or third-party service
  - Any public claim in the UI, README, Chrome Web Store listing, privacy policy, terms, or data disclosure
  - Any public policy document hosted outside the repo, including the Google Doc privacy policy URL used in the Chrome Web Store listing

## After Editing Code

- Run syntax checks for changed JavaScript files.
- Validate both manifests:
  - `manifest.json`
  - `extension/manifest.json`
- Confirm the version number was bumped if the user should reload or upload a new package.
- Confirm the Chrome upload ZIP is rebuilt from the correct extension root when a release package is needed.

## Privacy and Legal Consistency Review

Review these files after every code change that affects data, permissions, storage, scanning, exports, network access, or user-facing claims:

- `PRIVACY.md`
- `TERMS.md`
- `DATA_USAGE.md`
- `SUBMISSION_CHECKLIST.md`
- `README.md`
- `manifest.json`
- `extension/manifest.json`

Check that the documents still accurately answer:

- What data does the extension read?
- What data does it store?
- What data can appear in CSV exports?
- Does anything leave the user's browser?
- Are any third parties, APIs, analytics, ads, or backend servers involved?
- Are Chrome permissions still described honestly?
- Does the extension still avoid claiming final answers instead of candidate evidence?
- Does the extension still avoid claiming paywall bypass, publisher affiliation, or Google Scholar affiliation?
- Does the Chrome Web Store description match the real behavior?
- Does the public Google Doc privacy policy match `PRIVACY.md` and the current extension behavior?
- Does the Chrome Web Store Privacy page use the current public privacy policy URL?

## Required Doc Updates

Update privacy/terms/data docs immediately if any change adds or modifies:

- Remote AI calls
- Backend servers
- Analytics
- Advertising
- Payments or subscriptions
- Account/login features
- New Chrome permissions
- New host permissions
- New stored fields
- New exported fields
- New PDF/page extraction behavior
- Sharing, syncing, or transmitting user data

Also update the public privacy policy document before release when any of the above changes affect privacy or data handling.

## Final Response Habit

When reporting a completed code change to the user, include:

- What changed
- What was tested
- Whether the privacy/terms/data usage docs were reviewed
- Whether any policy documents needed updates
- Whether the upload ZIP was rebuilt
- Whether GitHub was updated, only if the user explicitly asked for GitHub
- Whether the public Google Doc privacy policy needs updating
