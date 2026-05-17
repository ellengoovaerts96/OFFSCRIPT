export type Reservation = {
  id: string;
  placeId?: string;
  userName?: string;
  reservationDate?: string;
  reservationTime?: string;
  numberOfPeople?: number;
  children: boolean;
  phone?: string;
  language?: string;
  notes?: string;
  status: "requested" | "confirmed" | "cancelled" | "failed";
};
