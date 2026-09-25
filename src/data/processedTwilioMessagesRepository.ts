import { pool } from "../integrations/postgres.js";

export async function claimTwilioMessage(
  messageSid: string,
  userPhone?: string
): Promise<boolean> {
  const result = await pool.query<{ message_sid: string }>(
    `
      INSERT INTO public.processed_twilio_messages (message_sid, user_phone, user_id)
      VALUES ($1, $2, (SELECT user_id FROM public.whatsapp_users WHERE user_phone = $2))
      ON CONFLICT (message_sid) DO NOTHING
      RETURNING message_sid
    `,
    [messageSid, userPhone ?? null]
  );

  return result.rowCount === 1;
}

/** Called only AFTER a successful MessageSid claim and identity resolution.
 * A first-ever claim may temporarily have no UUID; deduplication must happen first. */
export async function linkClaimedTwilioMessage(messageSid: string, userPhone: string): Promise<void> {
  await pool.query(`UPDATE public.processed_twilio_messages m
    SET user_id = u.user_id FROM public.whatsapp_users u
    WHERE m.message_sid = $1 AND m.user_phone = $2 AND u.user_phone = $2
      AND m.user_id IS NULL`, [messageSid, userPhone]);
}
