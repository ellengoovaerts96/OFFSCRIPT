import { pool } from "../integrations/postgres.js";

export type ReservationRequest = {
  placeId?: string;
  userName?: string;
  reservationDate?: string;
  reservationTime?: string;
  numberOfPeople?: number;
  children?: boolean;
  phone?: string;
  language?: string;
  notes?: string;
};

export async function createReservationRequest(input: ReservationRequest): Promise<void> {
  await pool.query(
    `
      INSERT INTO reservations (
        place_id,
        user_name,
        reservation_date,
        reservation_time,
        number_of_people,
        children,
        phone,
        language,
        notes,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'requested')
    `,
    [
      input.placeId ?? null,
      input.userName ?? null,
      input.reservationDate ?? null,
      input.reservationTime ?? null,
      input.numberOfPeople ?? null,
      input.children ?? false,
      input.phone ?? null,
      input.language ?? null,
      input.notes ?? null
    ]
  );
}
