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
  area?: string;
  vibe?: string;
  vibeTags: string[];
  offscriptPickLevel: 0 | 1 | 2 | 3;
  offscriptPriority: number;
  offscriptReason?: string;
  authenticity?: number;
  foodOrientation?: number;
  audienceOrientation?: number;
  audienceTags: string[];
  adventureLevel?: number;
  occasionTags: string[];
  workFriendly?: boolean;
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
  priceLevel?: 1 | 2 | 3 | 4 | 5;
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
