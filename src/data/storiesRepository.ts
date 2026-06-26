import { pool } from "../integrations/postgres.js";
import type { RetrievedStory, StoryKnowledgeMatch, StoryTranslation } from "../types/story.js";
import type { UserContext } from "../types/userContext.js";

type StoryRow = {
  id: string;
  slug: string;
  title: string;
  whatsapp_triggers: string[] | null;
  translations: StoryTranslation[];
};

type RelatedStoryRow = {
  id: string;
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  url_path: string;
};

const defaultSiteUrl = "https://go-offscript.app";

function normaliseText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function baseLocale(language?: string): string {
  return language?.split("-")[0]?.toLowerCase() || "en";
}

function chooseTranslation(translations: StoryTranslation[], language?: string): StoryTranslation | null {
  const locale = baseLocale(language);
  return (
    translations.find((translation) => translation.locale === locale) ??
    translations.find((translation) => translation.locale === "en") ??
    translations[0] ??
    null
  );
}

function createStoryUrl(urlPath: string): string {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || defaultSiteUrl).replace(/\/$/, "");
  return `${siteUrl}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`;
}

function messageMatchesTriggers(message: string, triggers: string[]): boolean {
  const normalisedMessage = normaliseText(message);

  return triggers.some((trigger) => {
    const normalisedTrigger = normaliseText(trigger);
    return normalisedTrigger.length > 0 && normalisedMessage.includes(normalisedTrigger);
  });
}

export async function findStoryKnowledgeMatch(
  message: string,
  language?: string
): Promise<StoryKnowledgeMatch | null> {
  const result = await pool.query<StoryRow>(
    `
      SELECT
        stories.id,
        stories.slug,
        stories.title,
        stories.whatsapp_triggers,
        COALESCE(
          json_agg(
            json_build_object(
              'locale', story_translations.locale,
              'title', story_translations.title,
              'shortWhatsappReply', story_translations.short_whatsapp_reply,
              'urlPath', story_translations.url_path
            )
            ORDER BY story_translations.locale
          ) FILTER (WHERE story_translations.id IS NOT NULL),
          '[]'
        ) AS translations
      FROM stories
      LEFT JOIN story_translations
        ON story_translations.story_id = stories.id
      WHERE stories.status = 'published'
        AND stories.whatsapp_triggers IS NOT NULL
      GROUP BY stories.id
      ORDER BY stories.featured DESC, stories.created_at DESC
    `
  );

  const story = result.rows.find((row) => messageMatchesTriggers(message, row.whatsapp_triggers ?? []));

  if (!story) {
    return null;
  }

  const translation = chooseTranslation(story.translations, language);

  if (!translation) {
    return null;
  }

  return {
    id: story.id,
    slug: story.slug,
    title: translation.title,
    shortWhatsappReply: translation.shortWhatsappReply,
    url: createStoryUrl(translation.urlPath)
  };
}

function storyCategoriesForContext(context: UserContext): string[] {
  const categories: string[] = [];

  if (context.intent === "food") categories.push("Food");
  if (context.intent === "culture") categories.push("Culture", "History", "Customs", "Religion");
  if (context.intent === "shopping") categories.push("Culture", "Customs");
  if (context.intent === "beach" || context.intent === "sports" || context.intent === "nature") {
    categories.push("Safety", "Transport", "Culture");
  }
  if (context.intent === "drink" || context.intent === "nightlife") categories.push("Etiquette", "Safety");

  return Array.from(new Set(categories));
}

export async function listRelatedStoriesForContext(
  context: UserContext,
  limit = 3
): Promise<RetrievedStory[]> {
  const locale = baseLocale(context.language);
  const categories = storyCategoriesForContext(context);
  const hasCategories = categories.length > 0;

  const result = await pool.query<RelatedStoryRow>(
    `
      SELECT
        stories.id,
        stories.slug,
        stories.category,
        COALESCE(preferred.title, fallback.title, stories.title) AS title,
        COALESCE(preferred.excerpt, fallback.excerpt, stories.excerpt) AS excerpt,
        COALESCE(preferred.url_path, fallback.url_path, '/stories/' || stories.slug) AS url_path
      FROM stories
      LEFT JOIN story_translations preferred
        ON preferred.story_id = stories.id
       AND preferred.locale = $1
      LEFT JOIN story_translations fallback
        ON fallback.story_id = stories.id
       AND fallback.locale = 'en'
      WHERE stories.status = 'published'
        AND ($2::boolean = false OR stories.category = ANY($3::text[]))
      ORDER BY
        CASE WHEN stories.category = ANY($3::text[]) THEN 0 ELSE 1 END,
        stories.featured DESC,
        stories.updated_at DESC
      LIMIT $4
    `,
    [locale, hasCategories, categories, limit]
  );

  return result.rows.map((story) => ({
    id: story.id,
    slug: story.slug,
    title: story.title,
    category: story.category,
    excerpt: story.excerpt,
    url: createStoryUrl(story.url_path)
  }));
}
