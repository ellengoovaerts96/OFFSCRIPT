import { resolveConversationLanguage } from "../src/ai/detectLanguage.js";
import { buildLocalDishLocationQuestion } from "../src/logic/buildClarifyingQuestion.js";
import { buildSearchProfile } from "../src/logic/buildSearchProfile.js";
import { needsClarification } from "../src/logic/needsClarification.js";
import { findMatchingCandidates, selectBestPlace } from "../src/logic/selectBestPlace.js";
import {
  placePassesSearchProfileHardConstraints,
  scoreSearchProfilePreferences
} from "../src/logic/searchProfileMatching.js";
import type { Place, PlaceCategory } from "../src/types/place.js";
import type { UserContext } from "../src/types/userContext.js";

type ConversationTurn = {
  user: string;
  context: Partial<UserContext>;
  expect: (context: UserContext) => void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function includes(values: string[] | undefined, expected: string): boolean {
  return values?.includes(expected) ?? false;
}

function place(
  name: string,
  options: Partial<Place> & {
    categories: PlaceCategory[];
    subcategories: string[];
  }
): Place {
  return {
    id: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
    name,
    country: "Senegal",
    region: "Dakar",
    neighbourhood: "Yoff",
    area: "Yoff",
    vibeTags: [],
    offscriptPickLevel: 0,
    offscriptPriority: 0,
    audienceTags: [],
    occasionTags: [],
    amenities: [],
    categories: options.categories,
    subcategories: options.subcategories.map((subcategory, index) => ({
      id: subcategory,
      name: subcategory,
      displayOrder: index + 1,
      images: []
    })),
    shortDescription: `${name} test fixture`,
    bestFor: [],
    notIdealFor: [],
    travellerTypes: [],
    childFriendly: false,
    bestTiming: [],
    closedDays: [],
    reservationNeeded: false,
    googleMapsUrl: `https://example.com/${encodeURIComponent(name)}`,
    guideAvailable: false,
    guideLanguages: [],
    images: [],
    status: "ready",
    ...options,
    subcategories: options.subcategories.map((subcategory, index) => ({
      id: subcategory,
      name: subcategory,
      displayOrder: index + 1,
      images: []
    }))
  };
}

function turn(
  message: string,
  contextPatch: Partial<UserContext>,
  previousContext?: UserContext
): UserContext {
  const context: UserContext = {
    ...previousContext,
    language: resolveConversationLanguage(message, previousContext?.language),
    ...contextPatch
  };
  return {
    ...context,
    searchProfile: buildSearchProfile(message, context, previousContext?.searchProfile)
  };
}

function runConversation(
  name: string,
  initialContext: UserContext | undefined,
  turns: ConversationTurn[]
): UserContext {
  let context = initialContext;
  for (const conversationTurn of turns) {
    context = turn(conversationTurn.user, conversationTurn.context, context);
    conversationTurn.expect(context);
  }
  console.log(`✓ ${name}`);
  return context as UserContext;
}

const anima = place("Anima Pizzeria", {
  categories: ["food"],
  subcategories: ["pizza"],
  neighbourhood: "Yoff",
  priceLevel: 1,
  offscriptPickLevel: 2,
  offscriptPriority: 90,
  occasionTags: ["lunch", "dinner", "budget_friendly"],
  vibe: "casual"
});
const pizzammore = place("Pizzammore", {
  categories: ["food"],
  subcategories: ["pizza", "italian restaurant"],
  neighbourhood: "Almadies",
  priceLevel: 4,
  occasionTags: ["dinner", "date_night"],
  vibe: "upscale italian"
});
const chezIso = place("Chez Iso", {
  categories: ["bar", "food"],
  subcategories: ["bar", "lunch"],
  neighbourhood: "Ouakam",
  area: "Oceanfront",
  occasionTags: ["drinks", "sunset", "beach_day"],
  vibeTags: ["calm", "scenic"],
  vibe: "calm oceanfront",
  offscriptPickLevel: 3,
  offscriptPriority: 98
});
const chezAm = place("Chez Am", {
  categories: ["bar"],
  subcategories: ["bar"],
  neighbourhood: "Yoff",
  area: "Beach",
  occasionTags: ["drinks", "sunset", "beach_day"],
  vibeTags: ["calm"],
  vibe: "chilled beach drinks",
  offscriptPriority: 75
});
const laPayotte = place("La Payotte", {
  categories: ["bar", "nightlife"],
  subcategories: ["bar"],
  neighbourhood: "Yoff",
  area: "Beach",
  occasionTags: ["drinks", "live_music", "nightlife", "beach_day"],
  vibeTags: ["rasta_reggae"],
  vibe: "Rasta & Reggae",
  offscriptPriority: 50
});
const surfSchool = place("Dakar Surf Atlantique", {
  categories: ["sports"],
  subcategories: ["surfing"],
  neighbourhood: "Yoff",
  bestTiming: ["morning", "afternoon"],
  offscriptPriority: 70
});
const quietWorkspace = place("Quiet Workspace", {
  categories: ["food"],
  subcategories: ["cafe", "working"],
  neighbourhood: "Ngor",
  amenities: ["air_conditioning", "wifi", "power_outlets"],
  workFriendly: true,
  occasionTags: ["working"],
  vibeTags: ["calm"],
  vibe: "quiet"
});
const localYoffOne = place("Local Yoff One", {
  categories: ["food"],
  subcategories: ["lunch", "senegalese food"],
  neighbourhood: "Yoff",
  foodOrientation: -2,
  priceLevel: 1,
  occasionTags: ["lunch", "local_experience"]
});
const localYoffTwo = place("Local Yoff Two", {
  categories: ["food"],
  subcategories: ["dinner", "senegalese food"],
  neighbourhood: "Yoff",
  foodOrientation: -2,
  priceLevel: 2,
  occasionTags: ["dinner", "local_experience"]
});

const pizzaContext = runConversation("pizza: location, then budget, then chic match", undefined, [
  {
    user: "Waar kan ik een pizza eten?",
    context: { intent: "food", requestedSubcategory: "pizza", directRequest: true },
    expect: (context) => {
      assert(context.intent === "food", "Pizza must produce food intent.");
      assert(context.requestedSubcategory === "pizza", "Pizza must be the product focus.");
      assert(
        needsClarification(context, [anima, pizzammore]) === "location",
        "Two pizza places in different neighbourhoods must ask for location first."
      );
    }
  },
  {
    user: "Het mag overal in Dakar zijn.",
    context: { targetRegion: "Dakar" },
    expect: (context) => {
      assert(context.targetRegion === "Dakar", "Dakar-wide mobility must be retained.");
      assert(context.requestedSubcategory === "pizza", "A location reply must retain pizza.");
      assert(
        needsClarification(context, [anima, pizzammore]) === "budget",
        "After Dakar-wide mobility, two differently priced pizza places must ask budget."
      );
    }
  },
  {
    user: "Chic graag.",
    context: { budget: "upscale" },
    expect: (context) => {
      assert(context.budget === "upscale", "Chic must normalize to upscale.");
      assert(
        selectBestPlace([anima, pizzammore], context)?.place.name === "Pizzammore",
        "An upscale pizza request must choose Pizzammore."
      );
    }
  }
]);
assert(pizzaContext.searchProfile?.products.includes("pizza"), "SearchProfile must retain pizza.");

const correctedDrinkContext = runConversation("negation: no pizza, only a chilled drink", pizzaContext, [
  {
    user: "Ik wil geen pizza, gewoon een chilled drink aan het strand.",
    context: {
      intent: "drink",
      requestedSubcategory: "beach",
      vibe: "calm",
      budget: undefined,
      excludedSubcategories: ["pizza"]
    },
    expect: (context) => {
      assert(context.intent === "drink", "The positive drink request must replace food intent.");
      assert(includes(context.excludedSubcategories, "pizza"), "Pizza must become an exclusion.");
      assert(context.requestedSubcategory === "beach", "Beach must remain a location feature.");
      assert(context.vibe === "calm", "Chilled must become calm.");
      assert(!context.searchProfile?.products.includes("pizza"), "Excluded pizza cannot remain positive.");
      assert(
        selectBestPlace([anima, chezAm], context)?.place.name === "Chez Am",
        "A corrected beach-drink request must never return Anima."
      );
    }
  }
]);

const sunsetCocktailContext = runConversation("cocktail, beach, sunset remain separate signals", undefined, [
  {
    user: "Waar kan ik rustig een cocktail drinken aan het strand bij sunset?",
    context: {
      intent: "drink",
      requestedSubcategory: "beach",
      timing: "sunset",
      vibe: "calm",
      directRequest: true
    },
    expect: (context) => {
      const profile = context.searchProfile;
      assert(profile?.activity === "drink", "Cocktail must produce drink activity.");
      assert(profile.products.includes("cocktails"), "Cocktails must be a product.");
      assert(profile.locationFeatures.includes("beachfront"), "Beach must be a location feature.");
      assert(profile.occasions.includes("sunset"), "Sunset must be an occasion.");
      assert(profile.vibes.includes("calm"), "Rustig must be a vibe.");
      assert(
        selectBestPlace([anima, chezIso], context)?.place.name === "Chez Iso",
        "The sunset beach cocktail fixture must choose Chez Iso."
      );
    }
  }
]);

runConversation("reggae drink on the beach", undefined, [
  {
    user: "Ik wil iets drinken aan het strand met een reggae sfeer.",
    context: {
      intent: "drink",
      requestedSubcategory: "beach",
      vibe: "rasta_reggae",
      directRequest: true
    },
    expect: (context) => {
      assert(context.intent === "drink", "Reggae drink must retain drink intent.");
      assert(context.vibe === "rasta_reggae", "Reggae must normalize to rasta_reggae.");
      assert(
        selectBestPlace([chezAm, laPayotte], context)?.place.name === "La Payotte",
        "A reggae drink request must choose La Payotte."
      );
    }
  }
]);

runConversation("surfing today", undefined, [
  {
    user: "Ik zou vandaag graag willen surfen.",
    context: {
      intent: "sports",
      requestedSubcategory: "surfing",
      directRequest: true
    },
    expect: (context) => {
      assert(context.intent === "sports", "Surfing must produce sports intent.");
      assert(context.requestedSubcategory === "surfing", "Surfing must be the focus.");
      assert(context.searchProfile?.activity === "surf", "SearchProfile activity must be surf.");
      assert(
        selectBestPlace([surfSchool], context)?.place.name === "Dakar Surf Atlantique",
        "Surfing must choose Dakar Surf Atlantique."
      );
    }
  }
]);

runConversation("quiet work with air conditioning", undefined, [
  {
    user: "Waar kan ik rustig werken met airco en wifi?",
    context: {
      intent: "work",
      requestedSubcategory: "working",
      requestedAmenities: ["air_conditioning", "wifi"],
      vibe: "calm",
      directRequest: true
    },
    expect: (context) => {
      assert(context.intent === "work", "Working must produce work intent.");
      assert(includes(context.requestedAmenities, "air_conditioning"), "Airco must be an amenity.");
      assert(includes(context.requestedAmenities, "wifi"), "Wifi must be an amenity.");
      assert(
        selectBestPlace([quietWorkspace], context)?.place.name === "Quiet Workspace",
        "The work request must choose the equipped workspace."
      );
    }
  }
]);

runConversation("local Senegalese food asks location but not budget", undefined, [
  {
    user: "Waar kan ik Thiéboudienne eten?",
    context: {
      intent: "food",
      requestedStyle: "local",
      directRequest: true
    },
    expect: (context) => {
      assert(context.intent === "food", "Thiéboudienne must produce food intent.");
      assert(context.requestedStyle === "local", "Thiéboudienne must be local food.");
      assert(
        needsClarification(context, [localYoffOne, localYoffTwo]) === "location",
        "Broad local food must ask for a neighbourhood."
      );
      assert(
        /buurt/i.test(buildLocalDishLocationQuestion(context)),
        "The Dutch local-food question must ask for the neighbourhood."
      );
    }
  },
  {
    user: "In Yoff.",
    context: { targetRegion: "Yoff" },
    expect: (context) => {
      assert(context.targetRegion === "Yoff", "Yoff must become the target neighbourhood.");
      assert(context.requestedStyle === "local", "The local style must survive a location reply.");
      assert(
        needsClarification(context, [localYoffOne, localYoffTwo]) === null,
        "Local food must not ask a budget question after neighbourhood is known."
      );
    }
  }
]);

runConversation(
  "conversation language remains French after category-only reply",
  { language: "fr", clarificationCount: 0 },
  [
    {
      user: "culture",
      context: { intent: "culture" },
      expect: (context) => {
        assert(context.language === "fr", "The word culture must not switch French to English.");
        assert(context.intent === "culture", "Culture must produce culture intent.");
        assert(
          needsClarification(context) === "subcategory",
          "A vague culture request must ask for a subcategory."
        );
      }
    }
  ]
);

const unequippedWorkspace = place("Editorial Favourite Without Airco", {
  categories: ["food"],
  subcategories: ["cafe", "working"],
  neighbourhood: "Ngor",
  amenities: ["wifi"],
  workFriendly: true,
  occasionTags: ["working"],
  vibeTags: ["calm"],
  offscriptPickLevel: 3,
  offscriptPriority: 100
});
const genericBeachBar = place("Generic High Priority Beach Bar", {
  categories: ["bar"],
  subcategories: ["bar"],
  neighbourhood: "Yoff",
  area: "Beach",
  occasionTags: ["drinks", "beach_day"],
  vibeTags: ["lively"],
  offscriptPickLevel: 3,
  offscriptPriority: 100
});

assert(
  !placePassesSearchProfileHardConstraints(anima, correctedDrinkContext.searchProfile),
  "An explicitly excluded product must fail the SearchProfile hard filter."
);
assert(
  findMatchingCandidates(
    [unequippedWorkspace, quietWorkspace],
    turn(
      "Waar kan ik rustig werken met airco?",
      {
        intent: "work",
        requestedSubcategory: "working",
        requestedAmenities: ["air_conditioning"],
        vibe: "calm"
      }
    )
  ).map((candidate) => candidate.name).join(",") === "Quiet Workspace",
  "A required amenity must be a hard filter, even against a stronger editorial favourite."
);
assert(
  scoreSearchProfilePreferences(chezIso, sunsetCocktailContext.searchProfile) >
    scoreSearchProfilePreferences(genericBeachBar, sunsetCocktailContext.searchProfile),
  "Sunset and calm must remain soft preferences that improve the best matching beach bar."
);
assert(
  findMatchingCandidates(
    [anima, chezIso, genericBeachBar],
    sunsetCocktailContext
  ).every((candidate) => candidate.name !== "Anima Pizzeria"),
  "When beach data exists, the location-feature candidate filter must remove non-beach places."
);
console.log("✓ hard filters and soft preferences remain distinct");

console.log("All real-conversation regression checks passed.");
