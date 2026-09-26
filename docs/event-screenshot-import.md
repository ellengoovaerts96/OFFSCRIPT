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

The chatbot checks published dashboard events before its existing event/search flow for questions such as “Wat is er te doen?”, events, workshops or concerts. It restricts dates to the requested day/week/weekend (default: this week), excludes past dates and finished events today, filters explicit neighbourhoods and requires childFriendly=yes for requests with children. Replies contain venue, neighbourhood, area, Maps URL, phone and entrance conditions when available. No match or a database failure preserves the existing fallback flow. Reviewed weekly schedules are expanded into actual occurrence dates within the requested period. Event prose is translated into the conversation language before delivery.

Additional tests: `npm run published-events:check`, `npm run event-persistence:check` (mocked database transaction tests). Run migrations and a live end-to-end screenshot → review → publish → WhatsApp check on staging before production.

Validation note: the broader `conversation:check` currently fails on the pizza-budget clarification fixture, identically on the pre-change HEAD. Targeted event checks, build, Dashboard and Places checks pass.

## Weekly events

Select Repeat → Every week, choose a weekday, and enter an active-from date in the event date field. Repeat until is optional and inclusive; leave it blank for an ongoing schedule. Change visibility to Draft to stop recommendations. Publishing requires a valid start date and weekday. A bounded range must contain at least one occurrence. One-time events keep their existing date behavior.

Explicit recurrence wording such as “Jeudis soir 20h” can preselect Thursday during import; a bare weekday or single dated event cannot. The original source wording is kept. No start date is inferred when none is given: the admin chooses when the schedule becomes active. Multiple weekdays and non-weekly patterns remain source text for manual review rather than being guessed.

The schedule fields (`recurrenceFrequency`, `recurrenceWeekday` with Sunday=0, and `recurrenceUntil`) are saved in the existing event `details` JSONB; `event_date` is the active-from date. No migration is needed. The chatbot expands published schedules into dates in Dakar time and retains the event’s location, contact and child-friendly details. Test with `npm run event-recurrence:check` and `npm run event-persistence:check`.

## Look up missing location details

The review/edit form has a “Zoek ontbrekende locatiegegevens” button. It submits only venue name, existing neighbourhood/area, Instagram account, source URL and the names of missing fields to an authenticated, CSRF-protected lookup endpoint. The existing OpenAI integration uses web search; it does not upload the screenshot again. Exact search/citation URLs are checked server-side. Ambiguous matches, unsupported fields and invented or uncited Maps links are discarded.

The admin sees the matched name/address, proposed values, evidence and source links. Each “Use proposal” button fills an empty field only and adds its source to verification notes. Existing input is preserved. Changing venue/context invalidates pending results. Nothing is written to the database by the lookup; Save event is still required and the review checkbox is cleared when accepting a proposal. This does not overwrite a shared place/venue record.

A timeout or unavailable service leaves the form intact. Missing details can always be entered manually. Automated checks: `npm run event-location:check` covers grounding, input validation, auth/CSRF, no database writes, browser acceptance and stale response handling with mocked services. A live OpenAI search remains to be checked on staging.

SQL regression check: `scripts/checkEventsOverviewSql.mjs` exercises the real repository queries using an isolated PGlite PostgreSQL instance and migrations 060/061. Install `@electric-sql/pglite` in a temporary directory and set `PGLITE_MODULE` to its `dist/index.js`, then run with `node --experimental-vm-modules --import tsx scripts/checkEventsOverviewSql.mjs`. It verifies an empty/populated overview, ordering, nullable ISO dates, detail reads and weekly published occurrences. Date projections use the distinct `event_date_iso` alias to avoid ambiguous `ORDER BY event_date` errors.

## Traveller event messages

Reviewed events are translated in one bounded OpenAI request into the conversation language (Dutch, French, English or German). Descriptive titles, descriptions, price wording and conditions are translated; dates, venue names, numbers and URLs are preserved. Translations that change numeric tokens or omit nonempty fields are rejected. Successful text translations are cached for 30 minutes (maximum 100 entries) using source text and language, so edits invalidate the cache. On timeout or unavailable translation, original facts are retained with an explicit notice in the user's language.

Each event is a separate message with a localized weekday/date, time, location, description, price/conditions and contact links. Standard tracking parameters are stripped from source links. International phone numbers become `wa.me` links; local numbers without a known country code remain plain phone numbers rather than guessing a destination. No guarantee is made that a venue has enabled WhatsApp for that number. Checks: `npm run published-events:check` and `npm run event-translation:check` (mocked AI).

Event replies also persist the resolved conversation language, including the live-search fallback. Only the language and update timestamp change; existing location/budget/search preferences remain intact. Short follow-ups such as “Top!” inherit that stored language. Regression: run `scripts/checkEventConversationLanguage.mjs` with the same temporary PGlite setup and Node flags described above; it checks French → Dutch event → “Top!”, explicit language switches, new users and preserved preferences.

## Daily events and visiting hours

Choose **Daily** under Repeat for an exhibition or other event that runs every day. Set the active-from date and optionally Repeat until (inclusive). Daily events do not need a weekday. Explicit daily source wording can preselect Daily for review; a date range alone does not prove daily opening.

**Opening time** and **Closing time** describe visiting hours on each occurrence. They are separate from Start time and End time, for example an opening reception. Leave unknown hours empty; document split hours and exceptions in the description. Visiting hours are shown in chatbot replies and a known closing time determines when today's occurrence stops being recommended. These fields use the existing details JSONB, so no migration is required.
