import { pool } from "../integrations/postgres.js";
import type { AcquisitionSource } from "../types/source.js";
import type { WhatsAppUser } from "../types/whatsappUser.js";

type WhatsAppUserRow = {
  user_phone: string;
  acquisition_source_id: string | null;
  acquired_at: Date | null;
  home_neighbourhood: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapWhatsAppUser(row: WhatsAppUserRow): WhatsAppUser {
  return {
    userPhone: row.user_phone,
    acquisitionSourceId: row.acquisition_source_id ?? undefined,
    acquiredAt: row.acquired_at?.toISOString(),
    homeNeighbourhood: row.home_neighbourhood ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export async function getOrCreateWhatsAppUser(userPhone: string): Promise<WhatsAppUser> {
  const result = await pool.query<WhatsAppUserRow>(
    `
      INSERT INTO public.whatsapp_users (user_phone)
      VALUES ($1)
      ON CONFLICT (user_phone) DO UPDATE SET
        updated_at = public.whatsapp_users.updated_at
      RETURNING user_phone, acquisition_source_id, acquired_at,
                home_neighbourhood, created_at, updated_at
    `,
    [userPhone]
  );

  return mapWhatsAppUser(result.rows[0]);
}

export async function getWhatsAppUser(userPhone: string): Promise<WhatsAppUser | null> {
  const result = await pool.query<WhatsAppUserRow>(
    `
      SELECT user_phone, acquisition_source_id, acquired_at,
             home_neighbourhood, created_at, updated_at
      FROM public.whatsapp_users
      WHERE user_phone = $1
      LIMIT 1
    `,
    [userPhone]
  );

  return result.rows[0] ? mapWhatsAppUser(result.rows[0]) : null;
}

export async function setFirstTouchAcquisition(
  userPhone: string,
  source: AcquisitionSource
): Promise<WhatsAppUser> {
  const result = await pool.query<WhatsAppUserRow>(
    `
      INSERT INTO public.whatsapp_users (
        user_phone,
        acquisition_source_id,
        acquired_at,
        home_neighbourhood
      )
      VALUES ($1, $2, NOW(), $3)
      ON CONFLICT (user_phone) DO UPDATE SET
        acquisition_source_id = CASE
          WHEN public.whatsapp_users.acquisition_source_id IS NULL
            THEN EXCLUDED.acquisition_source_id
          ELSE public.whatsapp_users.acquisition_source_id
        END,
        acquired_at = CASE
          WHEN public.whatsapp_users.acquisition_source_id IS NULL
            THEN EXCLUDED.acquired_at
          ELSE public.whatsapp_users.acquired_at
        END,
        home_neighbourhood = CASE
          WHEN public.whatsapp_users.acquisition_source_id IS NULL
            THEN EXCLUDED.home_neighbourhood
          ELSE public.whatsapp_users.home_neighbourhood
        END,
        updated_at = NOW()
      RETURNING user_phone, acquisition_source_id, acquired_at,
                home_neighbourhood, created_at, updated_at
    `,
    [userPhone, source.id, source.homeNeighbourhood ?? null]
  );

  return mapWhatsAppUser(result.rows[0]);
}
