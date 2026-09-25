import pg from 'pg';
import { pathToFileURL } from 'node:url';

export const identityTables = ['conversation_context', 'chat_messages', 'place_recommendation_history',
  'recommendation_feedback', 'processed_twilio_messages'];

/** Aggregate-only queries, safe to reuse inside an existing READ ONLY transaction. */
export async function checkUserIdentityIntegrity(db) {
  const users = (await db.query(`SELECT count(*)::int AS total, count(user_id)::int AS with_user_id,
    count(*) FILTER (WHERE user_id IS NULL)::int AS null_user_id,
    (count(user_id) - count(DISTINCT user_id))::int AS duplicate_user_id FROM public.whatsapp_users`)).rows[0];
  const tables = {};
  for (const table of identityTables) {
    tables[table] = (await db.query(`SELECT count(*)::int AS total,
      count(d.user_phone)::int AS with_legacy_identity, count(d.user_id)::int AS with_user_id,
      count(*) FILTER (WHERE d.user_phone IS NOT NULL AND (legacy.user_id IS NULL OR d.user_id IS NULL))::int AS unresolved,
      count(*) FILTER (WHERE d.user_id IS NOT NULL AND identity.user_id IS NULL)::int AS orphan_user_id,
      count(*) FILTER (WHERE d.user_id IS NOT NULL AND
        (d.user_phone IS NULL OR d.user_id IS DISTINCT FROM legacy.user_id))::int AS mismatched
      FROM public.${table} d LEFT JOIN public.whatsapp_users legacy ON legacy.user_phone = d.user_phone
      LEFT JOIN public.whatsapp_users identity ON identity.user_id = d.user_id`)).rows[0];
  }
  const ok = !users.null_user_id && !users.duplicate_user_id &&
    Object.values(tables).every(row => !row.unresolved && !row.orphan_user_id && !row.mismatched);
  return { ok, users, tables };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // No dotenv auto-load: the operator explicitly selects the intended environment.
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 12000, query_timeout: 30000 });
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
    await db.connect();
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const report = await checkUserIdentityIntegrity(db);
    await db.query('COMMIT');
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    // Never print a pg error object: detail can contain identifiers or connection data.
    console.error('Identity integrity check failed:', /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'CHECK_FAILED');
    process.exitCode = 1;
  } finally { await db.end(); }
}
