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

export type PlaceSubcategory = {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  images: PlaceImage[];
};

export type Place = {
  id: string;
  name: string;
  country: string;
  region: string;
  neighbourhood?: string;
  exactArea?: string;
  vibe?: string;
  categories: PlaceCategory[];
  subcategories: PlaceSubcategory[];
  shortDescription: string;
  practicalInfo?: string;
  personalTip?: string;
  story?: string;
  transport?: string;
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
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
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
