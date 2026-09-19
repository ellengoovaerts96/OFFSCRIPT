# OFFSCRIPT

## TUUTI Operations dashboard

The authenticated internal dashboard is available at `/admin`. It links to Field
Research, the current environment's `/inbox` and `/admin/sources`, and keeps LIVE
production destinations visually separate from staging. It uses the existing
`INBOX_USERNAME` and `INBOX_PASSWORD` HTTP Basic Auth credentials.

Set `TUUTI_ENVIRONMENT=STAGING` to label the current environment explicitly.
`RAILWAY_ENVIRONMENT_NAME` is used when available. The optional
`TUUTI_PRODUCTION_BASE_URL` overrides the known production origin; staging links
remain relative when the current environment is explicitly `STAGING`. Set
`TUUTI_STAGING_BASE_URL` in another environment if it should link back to staging.
When neither condition is met, staging destinations remain visibly unconfigured
instead of silently pointing to the current database.

The staging dashboard's `Test staging` action opens the authenticated
`/admin/test` chat. It calls the existing staging chat handler and labels itself
clearly; test messages are stored only in the database configured for that
deployment and consequently appear in the staging inbox.

## TUUTI accommodation source foundation

Pilot accommodations and other acquisition partners are stored in `sources`.
Each active source can use a public link such as `/go/villa-ngor`; that route
redirects to the existing TUUTI WhatsApp number with a machine-readable
`SRC:<code>` token in the prefilled message. `TUUTI_PUBLIC_WHATSAPP_NUMBER` may
override the public number; otherwise `TWILIO_WHATSAPP_FROM` is used.

The first valid source for a phone number is stored in `whatsapp_users`, along
with a snapshot of the source's home neighbourhood. This acquisition record is
deliberately separate from `conversation_context`, so resetting a conversation
does not erase or replace the original source. Later QR scans never overwrite
first-touch acquisition.

Twilio signs both WhatsApp webhook routes. Set `TWILIO_WEBHOOK_BASE_URL` to the
public HTTPS origin Twilio calls, for example `https://your-service.example`
(without a webhook path). Requests are validated with `TWILIO_AUTH_TOKEN` before
they are processed. Each inbound `MessageSid` is claimed atomically in
`processed_twilio_messages`, preventing Twilio retries from running the chatbot
twice.

### Sources Admin

The internal Sources Admin is available at `/admin/sources`. It reuses the same
HTTP Basic Auth credentials as `/inbox` (`INBOX_USERNAME` and
`INBOX_PASSWORD`). It can list, filter, create, edit, activate and deactivate
sources, and displays only aggregate acquisition counts. It never displays phone
numbers or chat content and deliberately offers no hard-delete operation.

Each detail page shows the public `/go/:slug` URL, its WhatsApp start token and a
dynamically generated, downloadable PNG QR code. The QR encodes the public TUUTI
URL so redirect behaviour can change later without reprinting it. The public
origin uses `TWILIO_WEBHOOK_BASE_URL` when configured. Source codes are generated
once and remain read-only; editing a name or slug therefore does not affect
historical `whatsapp_users.acquisition_source_id` attribution.

No additional migration is required for this admin: it uses the existing
`sources` and `whatsapp_users` tables from migration 048.

## Google Sheets field-research sync

The sync reads every row from the `Form responses 1` worksheet and upserts it into
`public.field_research_raw`. It derives `source_row_id` deterministically from the
Google Form `Timestamp`, which is the immutable source key. Share the spreadsheet with a
Google service account and configure these environment variables locally or in
your deployment platform:

```env
DATABASE_URL=
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Do not commit `.env` or service-account JSON files. The first row of the worksheet
must contain `Timestamp`; supported database column names are mapped after
normalizing spaces to underscores. Run the migration and test the sync without
committing changes:

```bash
npm run db:migrate
npm run sync:field-research -- --dry-run
```

The dry run is a read-only preflight: it reads the Sheet and database schema,
reports pending translations, and makes no OpenAI requests or database writes.
The configured `DATABASE_URL` always determines which database is inspected.

Run the production sync with:

```bash
npm run sync:field-research
```

Rows without a timestamp are skipped. Duplicate timestamps within the sheet are
collapsed to the last occurrence, and unchanged rows remain untouched. A separate
`Source Raw ID` column is not required. Rows without `Name of place/story/experience`
are also skipped. After a successful upsert, legacy rows without a source key are
removed only when a timestamp-keyed row with the same normalized place name exists.

### Place image reconciliation

Promote valid place rows from Raw into `places` before reconciling images:

```bash
npm run sync:places -- --dry-run
npm run sync:places
```

Import usable phone/WhatsApp contacts from Raw only after Places have been
reconciled. The contact sync matches Places by immutable `source_row_id`, falls
back to an unambiguous normalized name, and never overwrites populated contact
fields. Its dry run performs reads only:

```bash
npm run sync:contacts -- --dry-run
npm run sync:contacts
```

The Places sync matches by immutable `source_row_id`, falling back to a unique
normalized name only for legacy rows. It inserts missing places, updates mapped
Sheet-owned fields and normalized subcategories, never deletes Places rows, and
runs all writes in one transaction. Existing status values are preserved; new
places start as `draft`.

The field-research sync stores `image_1`, `image_2`, and `image_3` in
`field_research_raw` as source/reference material. Published place photos are
curated exclusively in **TUUTI Dashboard → Places & Content → Photos**.

The historical command is retained as a safe no-op. It never adds, removes, or
reorders `place_images`:

```bash
npm run sync:place-images -- --dry-run
npm run sync:place-images
```

Existing legacy and `source = 'field_research'` image rows remain unchanged and
available for manual curation in the dashboard. New dashboard uploads are stored
with `source = 'dashboard'`.

The staging Places admin uploads JPEG files to Cloudinary on the server and stores
only the secure URL and asset metadata in `place_images`. Configure
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the
server environment. The secret is never sent to the browser. Removing a photo in
the admin only removes its database relationship; it does not delete the Cloudinary
asset.

Fill missing `places.latitude` and `places.longitude` values from the existing
Google Maps links in a separate step:

```bash
npm run sync:place-coordinates -- --dry-run
npm run sync:place-coordinates
```

Short Maps links are resolved before their coordinates are parsed. The sync only
updates rows with a missing coordinate, never overwrites a complete coordinate
pair, and reports links that cannot be resolved instead of guessing a location.

### Editorial curation

OFFSCRIPT's editorial judgement lives directly on `places`, separately from the
field-research import. The protected fields include pick level and priority,
Dutch/English/French reasons, authenticity, food and audience orientation,
audience/occasion tags, adventure level, and work friendliness. The Raw-to-Places
sync deliberately does not write these columns, so a Form or Sheet sync cannot
erase manual curation. Unknown boolean judgements remain `NULL`, rather than being
treated as a confirmed `false`.

Create the protected `Editorial Ranking` worksheet once, after granting the
configured Google service account Editor access to the spreadsheet:

```bash
npm run setup:editorial-sheet
```

The command exports current non-archived Places and editorial values, safely
preserving existing review data while updating the worksheet structure.

### English and French content

The Sheet fields `Neighbourhood/exact area`, `Short description`, `Practical info`, `Personal tip`, and `Story`
are stored in their corresponding `_en` columns. On the first sync, and whenever
one of those English values changes, the sync uses `OPENAI_API_KEY` to generate the
corresponding `_fr` values, including `area_fr`. A SHA-256 source hash prevents unchanged rows from being
translated again.

French is the chatbot default. It reads `_fr` first and falls back to `_en`; only
an explicitly English conversation reads `_en` first. Dutch and German answers use
French as their stored factual source before response localization.

To protect a manually corrected French translation, set `translation_status` to
`manual` for that raw row. Later English changes retain the French text and mark the
row `manual_review_required` instead of overwriting it.

Places store the four content fields in explicit `_en` and `_fr` columns. Editorial
stories use the normalized `story_translations` table instead: one row per story and
locale. Generate or refresh missing French story translations with:

```bash
npm run translate:stories -- --dry-run
npm run translate:stories
```

Story retrieval defaults to French, then falls back to English. Explicitly English
conversations request the English translation first. Existing French story rows are
treated as manual content and are never overwritten automatically; changed English
source content marks them `manual_review_required`.

## Editorial ranking workflow

The `Editorial Ranking` tab is separate from the Form responses. Safely create or
refresh it (existing values are preserved by timestamp, with place name as legacy
fallback) using `npm run setup:editorial-sheet`.

Set `review_status` to `approved` only after review. Only approved rows sync:

```bash
npm run sync:editorial-ranking -- --dry-run
npm run sync:editorial-ranking
```

- `offscript_pick_level`: 0 ordinary, 1 recommended, 2 OFFSCRIPT Favourite, 3 Signature Experience.
- `offscript_priority`: 0-100 editorial order among otherwise suitable matches.
- `price_level`: 1 budget, 2 affordable, 3 average, 4 chic, 5 luxury.
- `authenticity`: 0 not relevant/curated through 4 exceptionally authentic.
- `food_orientation`: -2 very local food, -1 mainly local, 0 mixed, 1 mainly international, 2 very international; blank for non-food.
- `audience_orientation`: -2 strongly resident-oriented audience through 0 mixed to 2 strongly visitor-oriented.
- `audience_tags`: comma-separated audiences, for example `residents`, `expats`, `tourists`, `adventurous_travellers`, `families`, `couples`, `friends`, `business`. All expats use the single `expats` tag.
- `adventure_level`: 0 easy/comfortable, 1 mildly adventurous, 2 adventurous, 3 far outside the average visitor's comfort zone.
- `occasion_tags`: comma-separated use cases such as `family`, `couple`, `friends`, `drinks`, `live_music`, `budget_friendly`, `local_experience`, `nightlife`, `work_friendly`.
- `work_friendly`: TRUE, FALSE, or blank.
- `amenities`: comma-separated verified facilities using:
  `air_conditioning`, `wifi`, `power_outlets`, `indoor_seating`,
  `quiet_workspace`, `outdoor_seating`, `ocean_view`, `rooftop`,
  `swimming_pool`, `parking`, `wheelchair_accessible`, `delivery`,
  `takeaway`, `reservation_possible`, `whatsapp_contact`, `live_music`, or
  `alcohol_free_options`. Do not add a facility unless it is confirmed.

`quick_meal` is deliberately retired. Reasons can be written in Dutch; French and
English have separate columns. Ranking is applied only after intent, location and
hard suitability checks such as child safety. Explicit facility requests are also
hard constraints: a request for air conditioning never returns a place without
`air_conditioning`.

### Semantic request parsing

OpenAI first converts each message plus stored conversation context into validated
JSON. Positive preferences and hard exclusions are stored separately in
`excluded_categories`, `excluded_subcategories`, `dietary_exclusions`,
`avoid_audience_tags`, `maximum_price_level`, and `alcohol_allowed`. Exclusions
are applied before scoring and alternatives, so a rejected pizza, seafood dish,
tourist audience, price level, or alcohol-led venue cannot return through ranking.
Keyword parsing remains only as a fallback when the LLM is unavailable and never
generates SQL.

## Field Notes inbox

The French `OFFSCRIPT – Notes de terrain` Form writes fast, informal observations
to the `Field Notes` tab. The draft is not imported directly into PostgreSQL.
Configure the new spreadsheet separately:

```text
GOOGLE_FIELD_NOTES_SPREADSHEET_ID=<ID between /d/ and /edit>
```

Share that spreadsheet as Editor with `GOOGLE_SERVICE_ACCOUNT_EMAIL`. Then preview
and process all rows whose status is `new`:

```bash
npm run setup:field-notes-sheet
npm run process:field-notes -- --dry-run
npm run process:field-notes
```

The processor creates the complete `Structured Import` header, sends the draft
and the optional human observations to OpenAI using a strict schema, appends a
`needs_review` proposal, and changes the source status to `ai_processed`. It never
overwrites an existing structured note. Unmentioned facts remain blank and must
not be invented. Editorial text in `Structured Import` uses English as its single
editable source language, so a manual correction only has to be made once.
French and any other derived language must be generated from that approved English
source during the future database-import step. Human approval remains required
before database import.

The Field Notes Form interface is French, but researchers may write free text in
any language. `Field Notes` preserves those original answers. AI produces the
canonical English copy in `Structured Import`; explicit scores and selections are
normalized deterministically. Research audience tags use one `expats` value; old
responses containing `african_expats` or `international_expats` are normalized
to that same value. A future database importer must map `locals` to the current
Places matching convention `residents`.

The active Google Form is not automatically recreated from
`scripts/createFieldNotesForm.gs`. To manage it through the Forms API, enable the
Google Forms API, share the Form with the service account as an editor, and set a
`GOOGLE_FIELD_NOTES_FORM_ID` to the ID from its edit URL. The guarded
`npm run setup:field-notes-form` command updates that existing Form in place,
preserves the four existing assessment item IDs, and refuses to proceed if the
linked response Sheet differs from `GOOGLE_FIELD_NOTES_SPREADSHEET_ID`.

`npm run process:field-notes -- --dry-run` validates the inbox structure and all
explicit assessment selections without calling OpenAI or writing to Google
Sheets. The command without `--dry-run` performs AI structuring and updates the
source status.
