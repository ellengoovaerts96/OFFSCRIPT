# OFFSCRIPT

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

The Places sync matches by immutable `source_row_id`, falling back to a unique
normalized name only for legacy rows. It inserts missing places, updates mapped
Sheet-owned fields and normalized subcategories, never deletes Places rows, and
runs all writes in one transaction. Existing status values are preserved; new
places start as `draft`.

The field-research sync only updates `field_research_raw`. Reconcile its `image_1`,
`image_2`, and `image_3` values with `place_images` in a separate, reviewable step:

```bash
npm run sync:place-images -- --dry-run
npm run sync:place-images
```

The Sheet/Raw image order is authoritative for existing, uniquely matched place
names. Existing image rows and metadata are preserved when their URL remains in
Raw; new URLs are inserted, removed URLs are deleted, and `sort_order` is reset to
0..2. Raw rows without an existing unique Places match are skipped with a warning.
Always inspect the dry-run before running the write command. The write phase uses
one PostgreSQL transaction and rolls back every image change if any operation fails.

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
- `audience_orientation`: -2 strongly local audience through 0 mixed to 2 strongly international/tourist.
- `audience_tags`: comma-separated audiences, for example `locals`, `african_expats`, `international_expats`, `adventurous_travellers`, `families`, `couples`, `friends`, `business`.
- `adventure_level`: 0 easy/comfortable, 1 mildly adventurous, 2 adventurous, 3 far outside the average visitor's comfort zone.
- `occasion_tags`: comma-separated use cases such as `family`, `couple`, `friends`, `drinks`, `live_music`, `budget_friendly`, `local_experience`, `nightlife`, `work_friendly`.
- `work_friendly`: TRUE, FALSE, or blank.

`quick_meal` is deliberately retired. Reasons can be written in Dutch; French and
English have separate columns. Ranking is applied only after intent, location and
hard suitability checks such as child safety.

### Semantic request parsing

OpenAI first converts each message plus stored conversation context into validated
JSON. Positive preferences and hard exclusions are stored separately in
`excluded_categories`, `excluded_subcategories`, `dietary_exclusions`,
`avoid_audience_tags`, `maximum_price_level`, and `alcohol_allowed`. Exclusions
are applied before scoring and alternatives, so a rejected pizza, seafood dish,
tourist audience, price level, or alcohol-led venue cannot return through ranking.
Keyword parsing remains only as a fallback when the LLM is unavailable and never
generates SQL.
