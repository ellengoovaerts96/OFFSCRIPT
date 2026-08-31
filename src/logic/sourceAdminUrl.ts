export function publicSourceUrl(slug: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/go/${encodeURIComponent(slug)}`;
}

