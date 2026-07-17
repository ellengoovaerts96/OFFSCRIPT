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
  safetyConcern?: boolean;
  directRequest?: boolean;
};
