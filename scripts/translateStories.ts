import "dotenv/config";
import { createHash } from "node:crypto";
import { zodTextFormat } from "openai/helpers/zod";
import pg, { type PoolClient } from "pg";
import { z } from "zod";
import { getOpenAIClient, openaiModel } from "../src/integrations/openai.js";

type StoryRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  short_whatsapp_reply: string | null;
  translation_source_hash: string | null;
  translation_status: string | null;
  french_title: string | null;
};

type FrenchStory = {
  title: string;
  excerpt: string;
  body: string;
  shortWhatsappReply: string;
};

const frenchStorySchema = z.object({
  title: z.string(),
  excerpt: z.string(),
  body: z.string(),
  shortWhatsappReply: z.string()
});

function requireEnvironment(name: "DATABASE_URL" | "OPENAI_API_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function sourceHash(story: StoryRow): string {
  return createHash("sha256")
    .update(JSON.stringify([
      story.title,
      story.excerpt,
      story.body,
      story.short_whatsapp_reply
    ]))
    .digest("hex");
}

async function translateStory(story: StoryRow): Promise<FrenchStory> {
  const response = await getOpenAIClient().responses.parse({
    model: openaiModel,
    instructions: `Translate this OFFSCRIPT editorial story from English to natural French for travellers in Senegal.
Rules:
- Preserve every fact, proper noun, Wolof phrase, URL, price, time and phone number.
- Do not add information or remove details.
- Keep the tone warm, concise and locally respectful.
- Return all four fields in French.`,
    input: JSON.stringify({
      title: story.title,
      excerpt: story.excerpt,
      body: story.body,
      shortWhatsappReply: story.short_whatsapp_reply ?? story.excerpt
    }),
    text: {
      format: zodTextFormat(frenchStorySchema, "french_story")
    }
  });
  const translated = response.output_parsed;
  if (!translated) throw new Error(`OpenAI returned no French translation for story ${story.slug}.`);

  return {
    title: translated.title.trim(),
    excerpt: translated.excerpt.trim(),
    body: translated.body.trim(),
    shortWhatsappReply: translated.shortWhatsappReply.trim()
  };
}

async function upsertEnglishTranslation(client: PoolClient, story: StoryRow): Promise<void> {
  await client.query(`
    INSERT INTO public.story_translations (
      story_id, locale, title, excerpt, body, short_whatsapp_reply, url_path
    )
    VALUES ($1, 'en', $2, $3, $4, $5, $6)
    ON CONFLICT (story_id, locale) DO UPDATE SET
      title = EXCLUDED.title,
      excerpt = EXCLUDED.excerpt,
      body = EXCLUDED.body,
      short_whatsapp_reply = EXCLUDED.short_whatsapp_reply,
      url_path = EXCLUDED.url_path,
      updated_at = NOW()
  `, [
    story.id,
    story.title,
    story.excerpt,
    story.body,
    story.short_whatsapp_reply ?? story.excerpt,
    `/stories/${story.slug}`
  ]);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--dry-run");
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}. Supported: --dry-run`);
  }

  const databaseUrl = requireEnvironment("DATABASE_URL");
  requireEnvironment("OPENAI_API_KEY");
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });
  const client = await pool.connect();

  try {
    const result = await client.query<StoryRow>(`
      SELECT
        story.id,
        story.slug,
        story.title,
        story.excerpt,
        story.body,
        story.short_whatsapp_reply,
        story.translation_source_hash,
        story.translation_status,
        french.title AS french_title
      FROM public.stories AS story
      LEFT JOIN public.story_translations AS french
        ON french.story_id = story.id
       AND french.locale = 'fr'
      WHERE story.status <> 'archived'
      ORDER BY story.slug
    `);
    const translations = new Map<string, FrenchStory>();
    const hashes = new Map<string, string>();
    let manualReviewCount = 0;

    for (const story of result.rows) {
      const hash = sourceHash(story);
      hashes.set(story.id, hash);
      if (story.translation_source_hash === hash && story.french_title) continue;
      if (story.translation_status?.startsWith("manual") && story.french_title) {
        manualReviewCount += 1;
        continue;
      }
      translations.set(story.id, await translateStory(story));
    }

    await client.query("BEGIN");
    for (const story of result.rows) {
      await upsertEnglishTranslation(client, story);
      const translation = translations.get(story.id);
      const hash = hashes.get(story.id)!;

      if (translation) {
        await client.query(`
          INSERT INTO public.story_translations (
            story_id, locale, title, excerpt, body, short_whatsapp_reply, url_path
          )
          VALUES ($1, 'fr', $2, $3, $4, $5, $6)
          ON CONFLICT (story_id, locale) DO UPDATE SET
            title = EXCLUDED.title,
            excerpt = EXCLUDED.excerpt,
            body = EXCLUDED.body,
            short_whatsapp_reply = EXCLUDED.short_whatsapp_reply,
            url_path = EXCLUDED.url_path,
            updated_at = NOW()
        `, [
          story.id,
          translation.title,
          translation.excerpt,
          translation.body,
          translation.shortWhatsappReply,
          `/fr/stories/${story.slug}`
        ]);
        await client.query(`
          UPDATE public.stories
          SET translation_source_hash = $2,
              translation_status = 'auto',
              translation_updated_at = NOW()
          WHERE id = $1
        `, [story.id, hash]);
      } else if (story.translation_status?.startsWith("manual") && story.translation_source_hash !== hash) {
        await client.query(`
          UPDATE public.stories
          SET translation_source_hash = $2,
              translation_status = 'manual_review_required'
          WHERE id = $1
        `, [story.id, hash]);
      }
    }

    if (dryRun) await client.query("ROLLBACK");
    else await client.query("COMMIT");

    console.log(`${dryRun ? "Dry run" : "Story translation"} complete: ${result.rowCount} stories checked; ${translations.size} French translations generated; ${manualReviewCount} manual translations preserved for review.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`Story translation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
