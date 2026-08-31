import { randomInt } from "node:crypto";
import { z } from "zod";
import { createSource } from "../data/sourcesRepository.js";
import { SOURCE_TYPES, type AcquisitionSource, type SourceWriteInput } from "../types/source.js";
import { KNOWN_REGIONS, normalizeRegion } from "../utils/normalizeRegion.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 5;

const optionalCoordinate = (minimum: number, maximum: number, label: string) =>
  z.preprocess(
    (value) => value === "" || value === null || value === undefined ? undefined : Number(value),
    z.number({ error: `${label} must be a number.` }).min(minimum).max(maximum).optional()
  );

const sourceFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  sourceType: z.enum(SOURCE_TYPES, { error: "Choose a valid source type." }),
  slug: z.string().trim().max(160),
  homeNeighbourhood: z.string().trim().max(120),
  latitude: optionalCoordinate(-90, 90, "Latitude"),
  longitude: optionalCoordinate(-180, 180, "Longitude"),
  active: z.boolean()
}).superRefine((value, context) => {
  if (value.sourceType === "accommodation" && !value.homeNeighbourhood) {
    context.addIssue({ code: "custom", path: ["homeNeighbourhood"], message: "Neighbourhood is required for accommodation." });
  }
  if (value.homeNeighbourhood) {
    const normalized = normalizeRegion(value.homeNeighbourhood);
    if (!normalized || !KNOWN_REGIONS.includes(normalized)) {
      context.addIssue({ code: "custom", path: ["homeNeighbourhood"], message: "Choose a known neighbourhood or region." });
    }
  }
  if (value.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) {
    context.addIssue({ code: "custom", path: ["slug"], message: "Use lowercase letters, numbers and single hyphens only." });
  }
});

export type SourceFormValues = {
  name: string;
  sourceType: string;
  slug: string;
  homeNeighbourhood: string;
  latitude: string;
  longitude: string;
  active: boolean;
};

export type SourceFormResult =
  | { success: true; data: SourceWriteInput }
  | { success: false; values: SourceFormValues; errors: Record<string, string> };

function formString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function slugifySourceName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function generateSourceCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export function parseSourceForm(body: Record<string, unknown>): SourceFormResult {
  const values: SourceFormValues = {
    name: formString(body.name).trim(),
    sourceType: formString(body.source_type).trim(),
    slug: formString(body.slug).trim(),
    homeNeighbourhood: formString(body.home_neighbourhood).trim(),
    latitude: formString(body.latitude).trim(),
    longitude: formString(body.longitude).trim(),
    active: ["true", "1", "on", "yes"].includes(formString(body.active).toLowerCase())
  };
  const parsed = sourceFormSchema.safeParse({
    ...values,
    sourceType: values.sourceType,
    homeNeighbourhood: values.homeNeighbourhood
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      errors[field] ??= issue.message;
    }
    return { success: false, values, errors };
  }

  const slug = parsed.data.slug || slugifySourceName(parsed.data.name);
  if (!slug) {
    return { success: false, values, errors: { slug: "A URL-safe slug could not be generated from this name." } };
  }

  return {
    success: true,
    data: {
      name: parsed.data.name,
      sourceType: parsed.data.sourceType,
      slug,
      homeNeighbourhood: parsed.data.homeNeighbourhood
        ? normalizeRegion(parsed.data.homeNeighbourhood)
        : undefined,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      active: parsed.data.active
    }
  };
}

type CreateSourceFunction = (
  input: SourceWriteInput & { code: string }
) => Promise<AcquisitionSource>;

export function sourceUniqueConflict(error: unknown): "slug" | "code" | null {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "23505") return null;
  const constraint = "constraint" in error ? String(error.constraint ?? "") : "";
  const detail = "detail" in error ? String(error.detail ?? "") : "";
  if (/slug/i.test(constraint) || /\(slug\)/i.test(detail)) return "slug";
  if (/code/i.test(constraint) || /\(code\)/i.test(detail)) return "code";
  return null;
}

export async function createSourceWithGeneratedCode(
  input: SourceWriteInput,
  creator: CreateSourceFunction = createSource
): Promise<AcquisitionSource> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await creator({ ...input, code: generateSourceCode() });
    } catch (error) {
      if (sourceUniqueConflict(error) !== "code" || attempt === MAX_CODE_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error("Could not generate a unique source code.");
}
