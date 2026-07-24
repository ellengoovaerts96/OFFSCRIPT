export type TravellerType = "solo" | "couple" | "friends" | "family" | "group" | "business" | "unknown";

export type UserIntent =
  | "food"
  | "drink"
  | "culture"
  | "beach"
  | "sports"
  | "nature"
  | "nightlife"
  | "shopping"
  | "work"
  | "stay"
  | "guide"
  | "reservation"
  | "unknown";

export type UserContext = {
  language: string;
  currentLocation?: string;
  targetRegion?: string;
  travellerType?: TravellerType;
  hasChildren?: boolean;
  childrenAges?: string;
  intent?: UserIntent;
  timing?: string;
  budget?: string;
  requestedSubcategory?: string;
  requestedStyle?: string;
  vibe?: string;
  excludedCategories?: UserIntent[];
  excludedSubcategories?: string[];
  dietaryExclusions?: string[];
  avoidAudienceTags?: string[];
  maximumPriceLevel?: 1 | 2 | 3 | 4 | 5;
  alcoholAllowed?: boolean;
  safetyConcern?: boolean;
  directRequest?: boolean;
  clarificationCount?: number;
};
