export function normalizeEditorialValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (value === undefined || value === "") return null;
  return value;
}

export function editorialValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeEditorialValue(left)) === JSON.stringify(normalizeEditorialValue(right));
}

export function unlockedFields<T extends string>(fields: readonly T[], lockedFields: readonly string[]): T[] {
  const locked = new Set(lockedFields);
  return fields.filter((field) => !locked.has(field));
}

export function changedEditorialFields(
  current: Record<string, unknown>,
  submitted: Record<string, unknown>,
  fields: readonly string[]
): string[] {
  return fields.filter((field) => !editorialValuesEqual(current[field], submitted[field]));
}
