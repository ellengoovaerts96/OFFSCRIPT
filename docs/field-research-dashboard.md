# Field Research / Structured Import (staging)

The staging dashboard at `/admin/field-research` follows this flow:

Google Form → **Field Notes** sheet → AI extraction → **Structured Import** sheet → editable dashboard review → explicit approval → Places.

The form and existing command-line sync scripts are unchanged. The new worker does not invoke `sync:places`, `sync:structured-import`, or any image/video import. These existing manual commands retain their original behavior.

## Configuration

Run normal database migrations, including `062_field_research_reviews.sql`. The normal start command runs migrations before the server starts.

The dashboard and worker require `TUUTI_ENVIRONMENT=STAGING` (or `RAILWAY_ENVIRONMENT_NAME=staging` when TUUTI_ENVIRONMENT is unset). The worker reuses these existing variables:

- `GOOGLE_FIELD_NOTES_SPREADSHEET_ID`: spreadsheet containing **Field Notes** and **Structured Import** tabs.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`: account with read/write access to that spreadsheet.
- `OPENAI_API_KEY` and optional existing `OPENAI_MODEL`.
- Existing `INBOX_USERNAME` / `INBOX_PASSWORD` for admin authentication and signed approval previews.

Use the staging database connection. No production database actions are needed. Credentials stay in the deployment's environment; do not put them in the repository.

The worker starts three seconds after server startup and checks again one minute after each run. It handles up to three new AI extractions per run. `FIELD_RESEARCH_AUTOMATION_ENABLED=false` disables automatic polling; the dashboard's manual check remains available on staging. Missing configuration and per-submission extraction errors appear in the dashboard. Refresh the overview after requesting a background check.

## Import behavior

- Timestamp/Horodateur and Note de terrain/Draft columns identify submissions. Existing researcher, visit-date and status columns are reused.
- Blank, `new`, and `ai_error` source statuses are eligible for AI extraction. Existing Structured Import proposals are reused, including rows already present before this feature.
- Original note content is preserved. Only the existing source processing-status cell is set to `ai_processed` after appending an AI proposal.
- Structured Import header additions are appended without clearing/reordering existing columns or rows. Proposals carry `needs_review`; they are never automatically approved.
- Stable `field-note:<timestamp>` source IDs prevent repeated extraction. Missing/duplicate timestamps are flagged for manual correction rather than silently merging submissions.
- Session advisory locking prevents multiple new workers from overlapping. Do not run the older manual processing script concurrently with this worker; that script has its original locking behavior.
- Failed extractions wait 15 minutes before retry, so one invalid submission cannot block the queue.
- Existing `field_research_raw` rows are mirrored read-only into the same overview. They are never edited or deleted by this feature.

## Review and approval

The overview has place-name search, status/region/neighbourhood/category/date filters, researcher and available source-photo thumbnails. The detail page groups actual source fields into Basic information, Editorial, Practical information and Media; original Form and Structured Import data remain inspectable.

Edits and statuses are stored in a separate dashboard review overlay, not written back over the source Sheet. Later syncs preserve those edits. Changed source data is flagged for comparison.

`Approve / Add to Places` saves the review, checks likely existing Places, then presents a field-by-field preview. Updating an existing Place requires selecting fields and confirming. New Places start as **drafts**; approval does not publish them. An exact duplicate name must be distinguished or handled with Update existing place because the existing Places schema requires unique names.

Empty/unknown fields do not erase existing values. New unknown child-friendliness remains null. Unmapped attributes remain in the review/provenance record. Source photos remain references and can be opened; this feature does not import, replace or delete Place photos/videos. A subcategory removal that would delete linked photos is blocked.

Approved fields receive the existing editorial locks. Existing publication state and unrelated fields are preserved. Stale previews, concurrent source changes and repeated approval submissions are rejected. The original `source_row_id`, raw snapshot, reviewed snapshot, selected changes and approving editor are recorded in the approval history.

Storage:

- `field_research_inbox`: source and Structured Import mirrors, processing errors.
- `field_research_reviews`: editable overlay, status, review version and linked Place.
- `field_research_approvals`: provenance and audit of confirmed Places writes.
- `field_research_sync_state`: last attempt/success and sync error.

## Offline verification

`npm run build` and `npm run field-research:check`. The integration check needs PGlite installed separately, or `PGLITE_MODULE` set to its module path. It uses isolated PostgreSQL, mocked Google Sheets and AI; it never connects to the application database. It covers idempotent migrations/sync, raw-data preservation, editable overlays, approval gating, duplicate detection, selective updates, rollback, stale previews, media preservation, error retries and the staging guard.

Deployment verification still requires a test submission through the configured staging Google Form/Sheet and manual review in the dashboard. Offline checks do not verify live service permissions or deployment configuration.
