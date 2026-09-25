# Phase 2C.1 — additive internal identity (staging)

Implemented on staging only, 2026-09-25. No phone encryption, masking, deletion,
retention changes, provider configuration or production/main changes.

## Environment and authorized orphan repair

The owner explicitly confirmed the local OFFSCRIPT `.env` DATABASE_URL is the
Railway **staging PostgreSQL** connection and that no production database URL is
stored there. No credentials, phone numbers or conversation contents were output.

Recheck found two orphan rows (one context, one recommendation history), sharing
one missing identity. Both matched the exact server-generated
`dashboard:test:<UUIDv4>` namespace, not a WhatsApp address. Under a short database
lock, one missing `whatsapp_users` row was inserted with `ON CONFLICT DO NOTHING`.
No context/history was deleted, no legacy identifier changed, no identity merged.
Subsequent migration kept the resulting user count at **2 → 2**.

## Dependency inventory and remaining legacy paths

| Location | Dependency / phase 2C.1 treatment |
| --- | --- |
| `whatsappUsersRepository.ts`, `types/whatsappUser.ts` | Exact `user_phone` remains the PK/unique lookup and first-touch conflict key. Central `resolveUserIdentity` returns both identifiers; `getOrCreateWhatsAppUser` is a compatibility alias. Existing acquisition upsert retains the same UUID. |
| `conversationContextRepository.ts` | Context reads resolve the exact phone to a UUID, then use `getConversationContextByUserId`. Full and language-only upserts dual-write. Legacy unique key and reset delete by phone remain. |
| `chatMessagesRepository.ts` | Message inserts resolve identity and dual-write. Latest message, recent messages, reset-boundary queries and inbox lateral joins still use phone. UUID is not shown in the inbox. |
| `recommendationHistoryRepository.ts` | Writes resolve identity and dual-write, including the old no-snapshot compatibility branch. Existing `(user_phone, place_id)` deduplication, reads and reset delete remain. |
| `recommendationFeedbackRepository.ts` | Inserts resolve identity and dual-write. Pending selection and reset closure still use phone. Detail updates already use feedback-record UUIDs. No feedback is deleted by reset. |
| `processedTwilioMessagesRepository.ts`, `twilioWebhook.ts` | Signature validation → claim SID → resolve identity → link claimed SID → source preprocessing. Claim is still first; duplicate delivery never creates/resolves an identity or processes chat. |
| `channels/whatsapp.ts`, `integrations/twilio.ts` | Inbound `From`, outbound routing, delayed delivery and logging call sites retain the exact external phone. No internal UUID is sent to Twilio or message text. |
| `app.ts`, `channels/webchat.ts`, `middleware/stagingChat.ts` | Staging gate, admin auth, CSRF and signed fictitious cookie are unchanged. Both handlers now resolve that identity before chat flow. Caller-controlled `userPhone` remains rejected. |
| `logic/chatbotFlow.ts`, `eventConversationLanguage.ts` | Public method signatures still accept phone. UserContext never gains identity fields. Recommendation logic, follow-ups, reset semantics and language behavior unchanged. Repository writes provide the identity layer. |
| `logic/sourceToken.ts`, `data/sourcesRepository.ts` | Source association by exact legacy identity remains; acquisition counts still count user phones. First-touch and home neighbourhood preserved across reset. |
| `channels/inbox.ts`, `types/chatMessage.ts` | Existing UI and phone-based row mapping retained; no UI redesign. |
| `migrations/001`, `004`, `007`, `048`–`051`, `059` | Historical schema and legacy keys remain untouched. No separate feedback-scheduling identity table found. |
| Tests/scripts | Source/deduplication, browser-security, natural-feedback and event-language fixtures updated for resolver/link dependencies. Added identity migration/repository tests and aggregate integrity checker. |

Unexpected dependency addressed: browser test paths previously wrote context/history
without creating `whatsapp_users`. Repository entry points now also resolve identity
so direct writes cannot recreate that failure through normal application code.

`reservations.phone` is a **contact field**, not a verified user identity. It remains
unchanged, as do place/contact/guide/field-research phone fields. No new user FK is
inferred for them.

No phone normalization is added: existing `whatsapp:+…`, bare phone variants and
fictional namespaces are kept distinct. Merging format variants would be an
unapproved identity migration. Existing outbound address formatting is unchanged.

## Schema and migration

`migrations/063_internal_user_identity.sql`:

- `whatsapp_users.user_id`: random `gen_random_uuid()` UUID, NOT NULL, unique index.
  Existing phone PK stays. A second unique `(user_phone, user_id)` index supports
  consistency enforcement.
- Nullable UUID column plus UUID index on `conversation_context`, `chat_messages`,
  `place_recommendation_history`, `recommendation_feedback`, and
  `processed_twilio_messages`.
- Each child has a restrictive UUID FK and a restrictive composite identity FK.
  The latter rejects assigning another valid user's UUID to a legacy phone.
  No cascading deletion or update is introduced.
- Exact-key backfill fills NULLs only. Unknown relationships or mismatches stop
  the atomic transaction. Migration never creates users to repair ambiguous data.
- Nullable column is added before its volatile default, avoiding a table rewrite.
  Lock timeout: 4 seconds; statement timeout: 30 seconds. For a future large/busy
  deployment that exceeds this bound, stop and stage concurrent index creation /
  chunked backfill; do not remove the timeouts to force it through.
- The existing runner replays migrations at startup. Repeated runs preserve UUIDs;
  tested twice directly on staging and with isolated fixtures. Legacy row counts
  and phone-key fingerprint were compared internally, without displaying keys.

A first-ever Twilio SID claim can temporarily have NULL `user_id`, because claiming
must precede identity creation. It is linked after successful resolution, before
source preprocessing. Claims without any legacy identity stay nullable. A crash
between claim and identity/link can leave an unresolved row: the read-only checker
reports it and exits nonzero; it must be investigated, not silently merged/deleted.

Rollback: roll the application back while leaving additive schema in place. Legacy
phone keys/columns remain usable. Old code can write NULL UUIDs; rerun the integrity
check and review/backfill before enabling UUID reads again. No automatic destructive
down migration is supplied.

## Migration integrity results

| Table | Total | Legacy identity | UUID | Unresolved | Orphan UUID | Mismatch |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| whatsapp_users | 2 | 2 | 2 | 0 | 0 | 0 |
| conversation_context | 2 | 2 | 2 | 0 | 0 | 0 |
| chat_messages | 516 | 516 | 516 | 0 | 0 | 0 |
| place_recommendation_history | 1 | 1 | 1 | 0 | 0 | 0 |
| recommendation_feedback | 1 | 1 | 1 | 0 | 0 | 0 |
| processed_twilio_messages | 172 | 172 | 172 | 0 | 0 | 0 |

Null/duplicate user UUIDs: **0 / 0**. Phone identities unchanged. UUID replay stable.
Staging functional fixture writes were enclosed in one transaction and rolled back.

## Verification and commands

- `npm run identity:test`: isolated PostgreSQL (PGlite dev dependency); atomic
  orphan-stop, migration replay, random/stable IDs, concurrent resolver calls,
  exact-key separation, context UUID reads, all dual writes, recommendation
  deduplication, follow-up, feedback, reset, acquisition, MessageSid ordering,
  nullable SID claims, restrictive/mismatch FK checks. Catalog and AI responses
  are fixtures; real flow and repositories execute. No provider calls.
- Same repository/flow suite against confirmed staging PostgreSQL with newly
  generated fictional identities, all rolled back. No real conversation read.
  Concurrent calls in this transaction share one PG connection; unique phone PK
  and atomic upsert are the cross-connection concurrency mechanism.
- `npm run chat-security:check`: real route registrations and middleware;
  production/unknown environment denial, auth, CSRF, forbidden caller identity,
  cookie isolation/expiry/tampering; resolver must run before each chat handler.
- `npm run source-tracking:check`: first-touch, SID deduplication, valid/invalid
  fictitious Twilio signatures and redirects.
- `npm run whatsapp-deadline:check`: immediate/delayed success, duplicate and error
  paths, information-before-contact delivery order.
- Natural-feedback and event-language regression scripts passed.
- Targeted TypeScript checks passed. Full TypeScript check passed using an identical
  source snapshot and dependency installation in a temporary directory (the local
  dependency tree had slow file reads).

Read-only production-safe diagnostic (operator explicitly selects environment):

```sh
npm run identity:check
```

Requires `DATABASE_URL` and the existing app TLS environment settings. It does not
load `.env` automatically. All queries run in a repeatable-read READ ONLY transaction;
outputs are aggregate counts only. Nonzero exit on unexplained identity problems.

Explicit staging functional test (mutations are temporary fixtures, rolled back):

```sh
TUUTI_ENVIRONMENT=staging npm run identity:test -- --staging-confirmed
```

Select the confirmed staging connection in the process environment first. Never run
this fixture mode against production. It does not run migrations on staging.

## Deployment baseline

Before this change, staging `/health` and remote branch reported `37efd478f41ad6343bdd10de1964e63cb5775243`.
Production `/health` and remote `main` reported `30a48b17b2382f5eaad6ebec4fa246139a062563`.
Only the `staging` branch is to be pushed. Final health/route/integrity verification
and deployed commit are reported in the task completion message.
