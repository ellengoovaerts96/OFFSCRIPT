export type PlaceCategory =
  | "food"
  | "bar"
  | "culture"
  | "beach"
  | "sports"
  | "nature"
  | "nightlife"
  | "shopping"
  | "stay"
  | "guide"
  | "other";

export type PlaceImage = {
  id: string;
  url: string;
  altText?: string;
  caption?: string;
  isHeroImage: boolean;
};

export type Place = {
  id: string;
  name: string;
  country: "Senegal";
  region: string;
  neighbourhood?: string;
  category: PlaceCategory;
  subcategory?: string;
  shortDescription: string;
  longDescription?: string;
  personalTip?: string;
  whyHiddenGem?: string;
  bestFor: string[];
  notIdealFor: string[];
  travellerTypes: string[];
  childFriendly: boolean;
  childNotes?: string;
  bestTiming: string[];
  openingHours?: string;
  closedDays: string[];
  priceLevel?: "low" | "medium" | "high" | "luxury";
  paymentNotes?: string;
  reservationNeeded: boolean;
  reservationMethod?: "phone" | "whatsapp" | "instagram" | "website" | "manual" | "not_possible";
  reservationContactName?: string;
  reservationPhone?: string;
  reservationUrl?: string;
  googleMapsUrl: string;
  latitude?: number;
  longitude?: number;
  transportNotes?: string;
  taxiNotes?: string;
  parkingNotes?: string;
  safetyNotes?: string;
  guideAvailable: boolean;
  guideName?: string;
  guidePhone?: string;
  guideLanguages: string[];
  images: PlaceImage[];
  status: "draft" | "ready" | "premium" | "archived";
};
