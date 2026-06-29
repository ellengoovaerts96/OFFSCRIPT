import { pool } from "../integrations/postgres.js";
import type { ChatDirection, InboxItem } from "../types/chatMessage.js";

type InboxRow = {
  id: string;
  user_phone: string;
  incoming_message: string;
  incoming_at: Date;
  outgoing_message: string | null;
  outgoing_at: Date | null;
};

export async function createChatMessage(input: {
  userPhone: string;
  direction: ChatDirection;
  message: string;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO chat_messages (user_phone, direction, message)
      VALUES ($1, $2, $3)
    `,
    [input.userPhone, input.direction, input.message]
  );
}

export async function getLastOutgoingMessage(userPhone: string): Promise<string | null> {
  const result = await pool.query<{ message: string }>(
    `
      SELECT message
      FROM chat_messages
      WHERE user_phone = $1
        AND direction = 'outgoing'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userPhone]
  );

  return result.rows[0]?.message ?? null;
}

export async function listRecentOutgoingMessages(userPhone: string, limit = 100): Promise<string[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 250);
  const result = await pool.query<{ message: string }>(
    `
      SELECT message
      FROM chat_messages
      WHERE user_phone = $1
        AND direction = 'outgoing'
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userPhone, safeLimit]
  );

  return result.rows.map((row) => row.message);
}

export async function listInboxItems(limit = 100): Promise<InboxItem[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 250);
  const result = await pool.query<InboxRow>(
    `
      SELECT
        incoming.id,
        incoming.user_phone,
        incoming.message AS incoming_message,
        incoming.created_at AS incoming_at,
        reply.message AS outgoing_message,
        reply.created_at AS outgoing_at
      FROM chat_messages incoming
      LEFT JOIN LATERAL (
        SELECT outgoing.message, outgoing.created_at
        FROM chat_messages outgoing
        WHERE outgoing.user_phone = incoming.user_phone
          AND outgoing.direction = 'outgoing'
          AND outgoing.created_at >= incoming.created_at
          AND outgoing.created_at < COALESCE(
            (
              SELECT next_incoming.created_at
              FROM chat_messages next_incoming
              WHERE next_incoming.user_phone = incoming.user_phone
                AND next_incoming.direction = 'incoming'
                AND next_incoming.created_at > incoming.created_at
              ORDER BY next_incoming.created_at ASC
              LIMIT 1
            ),
            'infinity'::timestamp
          )
        ORDER BY outgoing.created_at ASC
        LIMIT 1
      ) reply ON TRUE
      WHERE incoming.direction = 'incoming'
      ORDER BY incoming.created_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    userPhone: row.user_phone,
    incomingMessage: row.incoming_message,
    incomingAt: row.incoming_at.toISOString(),
    outgoingMessage: row.outgoing_message ?? undefined,
    outgoingAt: row.outgoing_at?.toISOString()
  }));
}
