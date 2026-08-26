import { pool } from "../integrations/postgres.js";

export async function claimTwilioMessage(
  messageSid: string,
  userPhone?: string
): Promise<boolean> {
  const result = await pool.query<{ message_sid: string }>(
    `
      INSERT INTO public.processed_twilio_messages (message_sid, user_phone)
      VALUES ($1, $2)
      ON CONFLICT (message_sid) DO NOTHING
      RETURNING message_sid
    `,
    [messageSid, userPhone ?? null]
  );

  return result.rowCount === 1;
}
