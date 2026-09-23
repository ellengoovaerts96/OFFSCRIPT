# Event screenshot import

On staging, open Dashboard → Events → Import from screenshot. PNG originals are preserved; JPG and HEIC are also accepted (12 MB maximum). HEIC gets a JPEG preview for vision/browser use while its original is retained in Cloudinary.

Optionally provide source type, source URL, month, year and publication date. Month/year can disambiguate “Saturday 19”; relative wording such as “this Saturday” requires publication context. Inconsistent weekdays or incomplete dates remain blank and are flagged. Review the screenshot beside the fields, select an existing venue, confirm the review checkbox, then Save event. The retry control can re-extract with changed month/year; it replaces current form edits.

There was no existing persisted Events form/table in this repository. This additive admin feature creates editable drafts in `public.events`; it does not publish events or change traveller recommendations. Migration `060_events_admin.sql` runs through the existing startup migration runner. Place matching never creates places.

Uses existing `OPENAI_API_KEY`, default OpenAI model configuration, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, database and admin credentials. Optional `OPENAI_EVENT_MODEL` overrides the extraction model. Never expose credentials in browser code.

Extraction uploads the source and returns a signed, 24-hour review token, with no event database write. Only an authenticated, CSRF-protected, validated save inserts a draft. Retrying a save uses the same unique import ID to avoid duplicates. Source metadata and original extraction are retained when editing. Cancelled uploads remain in Cloudinary for manual cleanup; no automatic asset deletion is implemented.

Checks: `npm run build`, `npm run event-import:check`, `npm run dashboard:check`, `npm run places-admin:check`. A live staging smoke test with an actual screenshot is still required to verify the configured OpenAI/Cloudinary services and database migration.
