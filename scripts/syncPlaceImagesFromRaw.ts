/**
 * Field Research photos are source material, not published TUUTI media.
 *
 * This command is intentionally retained as a safe no-op so an existing
 * operational checklist or terminal history cannot accidentally publish,
 * remove, or reorder place images. Final place photos are curated through
 * Places & Content in the TUUTI dashboard.
 */

const dryRun = process.argv.includes("--dry-run");

console.log(
  `${dryRun ? "Dry run" : "Sync"} skipped: Field Research photos remain in field_research_raw as reference material. ` +
  "Published place photos are managed only through the TUUTI dashboard; no place_images rows were changed."
);
