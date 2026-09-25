import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import pg from 'pg';
import { checkUserIdentityIntegrity } from './checkUserIdentityIntegrity.mjs';

// Default: isolated PostgreSQL. Explicit staging mode uses ONLY newly generated
// fictional fixtures, within a single transaction that is ALWAYS rolled back.
// No provider calls. Never run against production. No dotenv auto-load.
const staging = process.argv.includes('--staging-confirmed');
let db;
if (staging) {
  if (process.env.TUUTI_ENVIRONMENT !== 'staging' || !process.env.DATABASE_URL) throw new Error('Explicit staging configuration required');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 12000, query_timeout: 30000 });
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '4s'");
  db = { query: (...args) => client.query(...args), exec: sql => client.query(sql),
    close: async () => { try { await client.query('ROLLBACK'); } finally { await client.end(); } } };
} else {
  const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
  db = new PGlite();
}
const query = (sql, params) => db.query(sql, params).then(result => ({ ...result, rowCount: result.rowCount ?? result.affectedRows }));
async function expectConstraintFailure(sql, params, codes) {
  if (staging) await query('SAVEPOINT expected_failure');
  try { await assert.rejects(() => query(sql, params), error => codes.includes(error.code)); }
  finally { if (staging) await query('ROLLBACK TO SAVEPOINT expected_failure'); }
}
const sandbox = vm.createContext({ console, process, URL, Date, setTimeout, clearTimeout });
function mock(exports) {
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context: sandbox });
}
const cache = new Map();
async function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const promise = (async () => {
    const url = new URL(relative, import.meta.url);
    const module = new vm.SourceTextModule(stripTypeScriptTypes(await readFile(url, 'utf8')), { context: sandbox });
    await module.link(async specifier => {
      if (specifier.endsWith('/postgres.js')) return mock({ pool: { query } });
      const dep = specifier.startsWith('.') ? new URL(specifier.replace(/\.js$/, '.ts'), url) : null;
      if (dep?.pathname.includes('/data/') && !/(placesRepository|storiesRepository|contactsRepository|eventsRepository)/.test(dep.pathname)) {
        return load('../src/data/' + dep.pathname.split('/').pop());
      }
      if (dep?.pathname.endsWith('/placesRepository.ts')) return mock({ listRecommendationPlaces: async () => [fixturePlace] });
      if (dep?.pathname.endsWith('/storiesRepository.ts')) return mock({ findStoryKnowledgeMatch: async () => null });
      if (dep?.pathname.endsWith('/contactsRepository.ts')) return mock({ listPlaceContactDetails: async () => [] });
      if (dep?.pathname.endsWith('/eventsRepository.ts')) return mock({ listPublishedEvents: async () => [] });
      const ai = {
        buildUserContext: { buildUserContext: async ({ previousContext, message }) => ({
          route: 'place_lookup', confidence: 1,
          recommendationAction: message === 'Tell me more' ? 'ask_about_place' : 'new_search',
          context: { ...previousContext, language: 'en', currentLocation: 'Yoff', targetRegion: 'Yoff', intent: 'food', requestedSubcategory: 'Italian food' }
        }), acceptsBroaderLocation: () => false, inferRequestedStyle: () => undefined, isLocalSenegaleseDishRequest: () => false },
        interpretPlaceFeedback: { interpretPlaceFeedback: async () => ({ isFeedback: false, feedback: [], ambiguousPlace: false }) },
        findCurrentEvent: { isCurrentEventRequest: () => false, findCurrentEvent: async () => null, currentEventDateRange: () => ({}) },
        generatePlaceFollowUpReply: { generatePlaceFollowUpReply: async ({ place, needs }) => { assert.equal(place.id, fixturePlace.id); assert.equal(needs.currentLocation, 'Yoff'); return 'Fictional follow-up'; } },
        generateClarifyingQuestion: { generateClarifyingQuestion: async () => 'Fictional clarification' },
        localizeRecommendationText: { localizeRecommendationText: async input => input },
        localizeEventText: { localizeEventText: async events => ({ events, unavailable: false }) }
      };
      const aiName = dep?.pathname.split('/').pop().replace('.ts', '');
      if (dep?.pathname.includes('/ai/') && ai[aiName]) return mock(ai[aiName]);
      if (dep?.pathname.endsWith('/eventConversationLanguage.ts')) return load('../src/logic/eventConversationLanguage.ts');
      return mock(await import(dep?.href ?? specifier));
    });
    return module;
  })();
  cache.set(relative, promise);
  return promise;
}
async function repository(name) {
  const module = await load('../src/data/' + name + '.ts');
  if (module.status !== 'evaluated') await module.evaluate();
  return module.namespace;
}
const fixturePlace = {
  id: randomUUID(), name: 'Fictional Italian restaurant', region: 'Dakar', neighbourhood: 'Yoff',
  categories: ['food'], subcategories: [{ id: 'italian', name: 'Italian food', displayOrder: 0, images: [] }],
  shortDescription: 'A fictional Italian restaurant.', personalTip: 'A fictional test tip.',
  googleMapsUrl: 'https://example.test/map', status: 'published', priceLevel: 2,
  vibe: 'romantic', vibeTags: ['romantic'], offscriptPickLevel: 3,
  travellerTypes: [], bestFor: [], notIdealFor: [], images: [], imageUrls: [],
  amenities: [], audienceTags: [], bestTiming: [], dietaryTags: [], occasionTags: ['romantic'],
  country: 'Senegal', offscriptPriority: 10, closedDays: [], guideLanguages: [], childFriendly: false, reservationNeeded: false, guideAvailable: false
};
try {
  delete process.env.OPENAI_API_KEY;
  const migrations = ['001_initial_schema.sql', '004_chat_messages.sql', '007_place_recommendation_history.sql',
    '031_conversation_requested_subcategory.sql', '032_conversation_requested_style.sql',
    '038_conversation_clarification_count.sql', '041_conversation_semantic_preferences.sql',
    '045_conversation_search_profile.sql', '048_sources_whatsapp_acquisition.sql',
    '049_recommendation_context_snapshot.sql', '050_recommendation_feedback.sql',
    '051_positive_feedback_detail.sql', '059_feedback_conversation_reset.sql'];
  if (!staging) {
    for (const file of migrations) {
      const sql = (await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8'))
        .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''); // Core gen_random_uuid is available in PGlite.
      await db.exec(sql);
    }
    const amenitiesMigration = await readFile(new URL('../migrations/044_places_amenities.sql', import.meta.url), 'utf8');
    await db.exec(amenitiesMigration.match(/ALTER TABLE public\.conversation_context[^;]+;/)[0]);
  }
  const legacy = 'dashboard:test:' + randomUUID();
  await query('INSERT INTO whatsapp_users(user_phone) VALUES($1)', [legacy]);
  if (!staging) {
    await query("INSERT INTO conversation_context(user_phone,language,current_location) VALUES($1,'nl','Yoff')", [legacy]);
    await query("INSERT INTO chat_messages(user_phone,direction,message) VALUES($1,'incoming','fictional legacy message')", [legacy]);
  }
  const migration = await readFile(new URL('../migrations/063_internal_user_identity.sql', import.meta.url), 'utf8');
  if (!staging) {
    // An unknown orphan must STOP atomically, never be implicitly repaired.
    await query("INSERT INTO conversation_context(user_phone,language) VALUES('unconfirmed-fixture','fr')");
    await assert.rejects(() => db.exec(migration), /unresolved or mismatched/);
    await db.exec('ROLLBACK');
    assert.equal((await query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='whatsapp_users' AND column_name='user_id'")).rows[0].n, 0);
    await query("DELETE FROM conversation_context WHERE user_phone='unconfirmed-fixture'"); // Isolated fictitious fixture only.
    await db.exec(migration);
  }
  const users = await repository('whatsappUsersRepository');
  const ctx = await repository('conversationContextRepository');
  const history = await repository('recommendationHistoryRepository');
  const feedback = await repository('recommendationFeedbackRepository');
  const messages = await repository('chatMessagesRepository');
  const sid = await repository('processedTwilioMessagesRepository');
  if (staging) {
    await ctx.upsertConversationContext(legacy, { language: 'nl', currentLocation: 'Yoff' });
    await messages.createChatMessage({ userPhone: legacy, direction: 'incoming', message: 'fictional legacy message' });
  }
  const original = await users.getWhatsAppUser(legacy);
  assert.match(original.userId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  if (!staging) await db.exec(migration);
  assert.equal((await users.getWhatsAppUser(legacy)).userId, original.userId);
  assert.equal((await ctx.getConversationContextByUserId(original.userId)).currentLocation, 'Yoff');
  assert.equal(await ctx.getConversationContext('dashboard:test:' + randomUUID()), null);
  const fresh = 'dashboard:test:' + randomUUID();
  const concurrent = await Promise.all(Array.from({ length: 10 }, () => users.resolveUserIdentity(fresh)));
  assert.equal(new Set(concurrent.map(u => u.userId)).size, 1);
  assert.notEqual(concurrent[0].userId, original.userId);
  // Do not merge legacy format variants in the foundation phase.
  if (!staging) assert.notEqual((await users.resolveUserIdentity('whatsapp:+10000000000')).userId,
    (await users.resolveUserIdentity('+10000000000')).userId);
  await ctx.upsertConversationContext(fresh, { language: 'nl', currentLocation: 'Yoff', budget: 'low' });
  await ctx.upsertConversationLanguage(fresh, 'en');
  assert.equal((await ctx.getConversationContext(fresh)).budget, 'low');
  await messages.createChatMessage({ userPhone: fresh, direction: 'outgoing', message: 'fictional reply' });
  assert.equal(await messages.getLastOutgoingMessage(fresh), 'fictional reply');
  await query("INSERT INTO places(id,name,region,short_description,google_maps_url) VALUES($1,'Fictional place','Dakar','Fixture','https://example.test/map')", [fixturePlace.id]);
  await history.recordPlaceRecommendation({ userPhone: fresh, placeId: fixturePlace.id, placeName: fixturePlace.name, context: { language: 'nl', currentLocation: 'Yoff' } });
  await history.recordPlaceRecommendation({ userPhone: fresh, placeId: fixturePlace.id, placeName: fixturePlace.name, context: { language: 'nl', currentLocation: 'Yoff' } });
  assert.deepEqual(Array.from(await history.listRecommendedPlaceIds(fresh)), [fixturePlace.id]);
  assert.equal((await history.getLastRecommendedPlace(fresh)).contextSnapshot.currentLocation, 'Yoff');
  await feedback.createRecommendationFeedback({ userPhone: fresh, placeId: fixturePlace.id, placeName: fixturePlace.name, rating: 'loved', context: { language: 'nl' } });
  assert.equal((await feedback.getPendingRecommendationFeedback(fresh)).awaitingPositiveDetail, true);
  // First-touch attribution and UUID are independently stable.
  const sourceId = randomUUID();
  await query("INSERT INTO sources(id,code,slug,source_type,name) VALUES($1,$2,$2,'test','Fictional source')", [sourceId, 'fixture-' + sourceId]);
  await users.setFirstTouchAcquisition(fresh, { id: sourceId, homeNeighbourhood: 'Ngor' });
  await users.setFirstTouchAcquisition(fresh, { id: sourceId, homeNeighbourhood: 'Yoff' });
  assert.equal((await users.getWhatsAppUser(fresh)).homeNeighbourhood, 'Ngor');
  assert.equal((await users.getWhatsAppUser(fresh)).userId, concurrent[0].userId);
  // No UUID is manufactured before deduplication claims an unknown external identity.
  const inbound = 'dashboard:test:' + randomUUID();
  const webhook = await load('../src/logic/twilioWebhook.ts'); await webhook.evaluate();
  const order = [];
  const deps = {
    claimMessage: async (...args) => { order.push('claim'); return sid.claimTwilioMessage(...args); },
    ensureUser: async (...args) => { order.push('identity'); return users.resolveUserIdentity(...args); },
    linkMessage: async (...args) => { order.push('link'); return sid.linkClaimedTwilioMessage(...args); },
    preprocessMessage: async (_phone, message) => { order.push('source'); return { message }; }
  };
  const input = { messageSid: 'SM-fictional-' + randomUUID(), userPhone: inbound, message: 'fictional' };
  assert.equal((await webhook.namespace.prepareInboundWhatsAppMessage(input, deps)).duplicate, false);
  assert.equal((await webhook.namespace.prepareInboundWhatsAppMessage(input, deps)).duplicate, true);
  assert.deepEqual(order, ['claim', 'identity', 'link', 'source', 'claim']);
  assert.equal(await sid.claimTwilioMessage('SM-no-phone-' + randomUUID()), true); // nullable legacy identity remains supported
  // Real reset branch and repositories, with a fictional catalog and no AI/provider access.
  const flow = await load('../src/logic/chatbotFlow.ts'); await flow.evaluate();
  const reset = await flow.namespace.runChatbotFlow(fresh, 'reset');
  assert.equal(reset.type, 'clarification');
  assert.equal((await ctx.getConversationContext(fresh)).currentLocation, undefined);
  assert.equal((await users.getWhatsAppUser(fresh)).userId, concurrent[0].userId);
  assert.equal((await users.getWhatsAppUser(fresh)).acquisitionSourceId, sourceId);
  assert.equal((await history.listRecommendedPlaceIds(fresh)).length, 0);
  assert.equal(await feedback.getPendingRecommendationFeedback(fresh), null);
  assert.equal((await query('SELECT count(*)::int AS n FROM recommendation_feedback WHERE user_phone=$1', [fresh])).rows[0].n, 1);
  const newConversation = await flow.namespace.runChatbotFlow(fresh, 'I am looking for an Italian restaurant in Yoff');
  assert.equal(newConversation.type, 'recommendation');
  assert.equal(newConversation.placeId, fixturePlace.id);
  await flow.namespace.handleChatMessage({ userPhone: fresh, message: 'I am looking for an Italian restaurant in Yoff' });
  assert.equal((await history.getLastRecommendedPlace(fresh)).placeId, fixturePlace.id);
  const followUp = await flow.namespace.runChatbotFlow(fresh, 'Tell me more');
  assert.equal(followUp.message, 'Fictional follow-up');
  assert.equal((await users.getWhatsAppUser(fresh)).userId, concurrent[0].userId);
  // Each write entry point must resolve a previously unseen identity, even outside HTTP handlers.
  const direct = 'dashboard:test:' + randomUUID();
  await ctx.upsertConversationLanguage(direct, 'nl');
  assert.ok(await users.getWhatsAppUser(direct));
  const report = await checkUserIdentityIntegrity({ query });
  assert.equal(report.ok, true);
  // Referential constraints reject a valid UUID belonging to another legacy identity.
  await expectConstraintFailure('UPDATE conversation_context SET user_id=$1 WHERE user_phone=$2', [original.userId, fresh], ['23503']);
  await expectConstraintFailure('DELETE FROM whatsapp_users WHERE user_phone=$1', [fresh], ['23503', '23001']);
  if (!staging) await db.exec(migration);
  assert.equal((await users.getWhatsAppUser(fresh)).userId, concurrent[0].userId);
  assert.equal((await checkUserIdentityIntegrity({ query })).ok, true);
  assert.equal((await query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='reservations' AND column_name='user_id'")).rows[0].n, 0);
  if (!staging) console.log('Migration checks passed: atomic orphan stop, replay stability and exact-key isolation.');
  console.log((staging ? 'Staging rollback fixtures passed: ' : 'Isolated PostgreSQL checks passed: ') + 'concurrent resolution, dual writes, context, recommendations, follow-up, feedback, reset, acquisition, claim ordering and restrictive foreign keys.');
} finally { await db.close(); }
