# Event screenshot import

On staging, open Dashboard → Events → Import from screenshot. PNG originals are preserved; JPG and HEIC are also accepted (12 MB maximum). HEIC gets a JPEG preview for vision/browser use while its original is retained in Cloudinary.

Optionally provide source type, source URL, month, year and publication date. Month/year can disambiguate “Saturday 19”; relative wording such as “this Saturday” requires publication context. Inconsistent weekdays or incomplete dates remain blank and are flagged. Review the screenshot beside the fields, select an existing venue, confirm the review checkbox, then Save event. The retry control can re-extract with changed month/year; it replaces current form edits.

There was no existing persisted Events form/table in this repository. This additive admin feature creates editable drafts in `public.events`. An admin can explicitly select “Reviewed — available to chatbot” after checking the event. A complete date and venue are required. Returning visibility to Draft removes it from chatbot recommendations. Migration `060_events_admin.sql` runs through the existing startup migration runner. Place matching never creates curated places. Migration `061_event_venues_publication.sql` adds reusable event venues and publication status.

Uses existing `OPENAI_API_KEY`, default OpenAI model configuration, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, database and admin credentials. Optional `OPENAI_EVENT_MODEL` overrides the extraction model. Never expose credentials in browser code.

Extraction uploads the source and returns a signed, 24-hour review token, with no event database write. Only an authenticated, CSRF-protected, validated save inserts an event; visibility defaults to Draft unless the admin explicitly selects chatbot availability. Retrying a save uses the same unique import ID to avoid duplicates. Source metadata and original extraction are retained when editing. Cancelled uploads remain in Cloudinary for manual cleanup; no automatic asset deletion is implemented.

Checks: `npm run build`, `npm run event-import:check`, `npm run dashboard:check`, `npm run places-admin:check`. A live staging smoke test with an actual screenshot is still required to verify the configured OpenAI/Cloudinary services and database migration.

Events can be independent of places: venueName, neighbourhood, area, googleMapsUrl and contactPhone are stored in each event’s existing `details` JSONB column, whether or not `place_id` is selected. No new place is created, and a place link is optional. Existing events default missing fields to empty; these additional JSON fields do not require individual SQL columns.

The event-specific `childFriendly` field uses yes/no/unknown and is also stored in `details`. Workshops are supported by the free-text category. Extraction only marks child suitability when explicit, retains age restrictions in the description, and otherwise uses unknown, including for older events.

## Reusable venues and chatbot

Existing places and saved event venues appear in the same selector. Missing name, neighbourhood, area, Maps URL and phone are filled from the selected record; explicit event values take precedence. Import uses a unique exact name match only. Duplicate names require manual selection. Choosing a different venue updates inherited values and preserves manual edits for review.

Saving an unlinked venue creates a reusable `event_venues` record within the event transaction. It is not a curated Places entry. A stable key of name/location/Maps URL avoids exact duplicates, and import-token retries are serialized and idempotent. Edits in an event stay specific to that event and do not modify the shared venue. To store a separate venue, choose “New event venue”. Existing saved events gain these reusable links when next saved.

The chatbot checks published dashboard events before its existing event/search flow for questions such as “Wat is er te doen?”, events, workshops or concerts. It restricts dates to the requested day/week/weekend (default: this week), excludes past dates and finished events today, filters explicit neighbourhoods and requires childFriendly=yes for requests with children. Replies contain venue, neighbourhood, area, Maps URL, phone and entrance conditions when available. No match or a database failure preserves the existing fallback flow. This does not expand explicit recurrences into future dates. Descriptions retain the admin/source language.

Additional tests: `npm run published-events:check`, `npm run event-persistence:check` (mocked database transaction tests). Run migrations and a live end-to-end screenshot → review → publish → WhatsApp check on staging before production.

Validation note: the broader `conversation:check` currently fails on the pizza-budget clarification fixture, identically on the pre-change HEAD. Targeted event checks, build, Dashboard and Places checks pass.
