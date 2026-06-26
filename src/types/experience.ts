export type Experience = {
  id: string;
  title: string;
  slug: string;
  shortDescription?: string;
  fullDescription?: string;
  duration?: string;
  location?: string;
  price?: number;
  currency: string;
  maxPeople?: number;
  childFriendly: boolean;
  meetingPoint?: string;
  reservationRequired: boolean;
  whatsappPrefillText?: string;
  url: string;
};
