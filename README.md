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
`Source Raw ID` column is not required.
