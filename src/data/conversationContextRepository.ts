import { pool } from "../integrations/postgres.js";
import type { UserContext, UserIntent, TravellerType } from "../types/userContext.js";

type ConversationContextRow = {
  language: string | null;
  current_location: string | null;
  target_region: string | null;
  traveller_type: TravellerType | null;
  has_children: boolean | null;
  children_ages: string | null;
  intent: UserIntent | null;
  timing: string | null;
  budget: string | null;
  requested_subcategory: string | null;
  requested_style: string | null;
  requested_amenities: string[] | null;
  vibe: string | null;
  excluded_categories: UserIntent[] | null;
  excluded_subcategories: string[] | null;
  dietary_exclusions: string[] | null;
  avoid_audience_tags: string[] | null;
  maximum_price_level: UserContext["maximumPriceLevel"] | null;
  alcohol_allowed: boolean | null;
  safety_concern: boolean | null;
  clarification_count: number | null;
};

function mapContext(row: ConversationContextRow): UserContext {
  return {
    language: row.language ?? "fr",
    currentLocation: row.current_location ?? undefined,
    targetRegion: row.target_region ?? undefined,
    travellerType: row.traveller_type ?? undefined,
    hasChildren: row.has_children ?? undefined,
    childrenAges: row.children_ages ?? undefined,
    intent: row.intent ?? undefined,
    timing: row.timing ?? undefined,
    budget: row.budget ?? undefined,
    requestedSubcategory: row.requested_subcategory ?? undefined,
    requestedStyle: row.requested_style ?? undefined,
    requestedAmenities: row.requested_amenities ?? [],
    vibe: row.vibe ?? undefined,
    excludedCategories: row.excluded_categories ?? [],
    excludedSubcategories: row.excluded_subcategories ?? [],
    dietaryExclusions: row.dietary_exclusions ?? [],
    avoidAudienceTags: row.avoid_audience_tags ?? [],
    maximumPriceLevel: row.maximum_price_level ?? undefined,
    alcoholAllowed: row.alcohol_allowed ?? undefined,
    safetyConcern: row.safety_concern ?? undefined,
    clarificationCount: row.clarification_count ?? 0
  };
}

export async function getConversationContext(userPhone: string): Promise<UserContext | null> {
  const result = await pool.query<ConversationContextRow>(
    `
      SELECT language, current_location, target_region, traveller_type, has_children,
             children_ages, intent, timing, budget, requested_subcategory, requested_style, requested_amenities, vibe, safety_concern,
             excluded_categories, excluded_subcategories, dietary_exclusions, avoid_audience_tags,
             maximum_price_level, alcohol_allowed, clarification_count
      FROM conversation_context
      WHERE user_phone = $1
      LIMIT 1
    `,
    [userPhone]
  );

  return result.rows[0] ? mapContext(result.rows[0]) : null;
}

export async function deleteConversationContext(userPhone: string): Promise<void> {
  await pool.query(
    `
      DELETE FROM conversation_context
      WHERE user_phone = $1
    `,
    [userPhone]
  );
}

export async function upsertConversationContext(userPhone: string, context: UserContext): Promise<void> {
  await pool.query(
    `
      INSERT INTO conversation_context (
        user_phone,
        language,
        current_location,
        target_region,
        traveller_type,
        has_children,
        children_ages,
        intent,
        timing,
        budget,
        requested_subcategory,
        requested_style,
        requested_amenities,
        vibe,
        excluded_categories,
        excluded_subcategories,
        dietary_exclusions,
        avoid_audience_tags,
        maximum_price_level,
        alcohol_allowed,
        safety_concern,
        clarification_count,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
      ON CONFLICT (user_phone) DO UPDATE SET
        language = EXCLUDED.language,
        current_location = EXCLUDED.current_location,
        target_region = EXCLUDED.target_region,
        traveller_type = EXCLUDED.traveller_type,
        has_children = EXCLUDED.has_children,
        children_ages = EXCLUDED.children_ages,
        intent = EXCLUDED.intent,
        timing = EXCLUDED.timing,
        budget = EXCLUDED.budget,
        requested_subcategory = EXCLUDED.requested_subcategory,
        requested_style = EXCLUDED.requested_style,
        requested_amenities = EXCLUDED.requested_amenities,
        vibe = EXCLUDED.vibe,
        excluded_categories = EXCLUDED.excluded_categories,
        excluded_subcategories = EXCLUDED.excluded_subcategories,
        dietary_exclusions = EXCLUDED.dietary_exclusions,
        avoid_audience_tags = EXCLUDED.avoid_audience_tags,
        maximum_price_level = EXCLUDED.maximum_price_level,
        alcohol_allowed = EXCLUDED.alcohol_allowed,
        safety_concern = EXCLUDED.safety_concern,
        clarification_count = EXCLUDED.clarification_count,
        updated_at = NOW()
    `,
    [
      userPhone,
      context.language,
      context.currentLocation ?? null,
      context.targetRegion ?? null,
      context.travellerType ?? null,
      context.hasChildren ?? null,
      context.childrenAges ?? null,
      context.intent ?? null,
      context.timing ?? null,
      context.budget ?? null,
      context.requestedSubcategory ?? null,
      context.requestedStyle ?? null,
      context.requestedAmenities ?? [],
      context.vibe ?? null,
      context.excludedCategories ?? [],
      context.excludedSubcategories ?? [],
      context.dietaryExclusions ?? [],
      context.avoidAudienceTags ?? [],
      context.maximumPriceLevel ?? null,
      context.alcoholAllowed ?? null,
      context.safetyConcern ?? null,
      context.clarificationCount ?? 0
    ]
  );
}
