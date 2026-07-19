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
  vibe: string | null;
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
    vibe: row.vibe ?? undefined,
    safetyConcern: row.safety_concern ?? undefined,
    clarificationCount: row.clarification_count ?? 0
  };
}

export async function getConversationContext(userPhone: string): Promise<UserContext | null> {
  const result = await pool.query<ConversationContextRow>(
    `
      SELECT language, current_location, target_region, traveller_type, has_children,
             children_ages, intent, timing, budget, requested_subcategory, requested_style, vibe, safety_concern,
             clarification_count
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
        vibe,
        safety_concern,
        clarification_count,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
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
        vibe = EXCLUDED.vibe,
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
      context.vibe ?? null,
      context.safetyConcern ?? null,
      context.clarificationCount ?? 0
    ]
  );
}
