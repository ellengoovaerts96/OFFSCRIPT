export type SearchActivity =
  | "eat"
  | "drink"
  | "shop"
  | "surf"
  | "work"
  | "dance"
  | "visit"
  | "relax"
  | "sports"
  | "stay"
  | "guide"
  | "reservation"
  | "unknown";

export type SearchMobility = "nearby" | "dakar_wide";

export type SearchProfile = {
  activity?: SearchActivity;
  products: string[];
  locationFeatures: string[];
  occasions: string[];
  vibes: string[];
  neighbourhood?: string;
  mobility?: SearchMobility;
  budget?: string;
  amenities: string[];
  dietaryRequirements: string[];
  exclusions: {
    products: string[];
    categories: string[];
    audienceTags: string[];
    dietary: string[];
  };
  travellerType?: "solo" | "couple" | "friends" | "family" | "group" | "business" | "unknown";
  hasChildren?: boolean;
};
