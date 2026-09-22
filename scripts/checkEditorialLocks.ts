import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { changedEditorialFields, unlockedFields } from "../src/logic/editorialLocks.js";

assert.deepEqual(
  changedEditorialFields({ price_level: 2, name: "Tokyo Jo" }, { price_level: 2, name: "Tokyo Jo" }, ["price_level", "name"]),
  [],
  "Saving identical values must not lock any field."
);
assert.deepEqual(
  changedEditorialFields({ price_level: 2, name: "Tokyo Jo" }, { price_level: 3, name: "Tokyo Jo" }, ["price_level", "name"]),
  ["price_level"],
  "Only the actually changed field may be locked."
);
assert.deepEqual(unlockedFields(["name", "price_level", "subcategories"], ["price_level"]), ["name", "subcategories"]);
assert.deepEqual(
  changedEditorialFields({ opening_hours: "Mon–Sun 13:30–00:30" }, { opening_hours: "Mon–Sun 13:30–00:30" }, ["opening_hours"]),
  [],
  "Unchanged opening hours must not become locked."
);
assert.deepEqual(
  changedEditorialFields({ opening_hours: "Mon–Sun 13:30–00:30" }, { opening_hours: "Fri 15:00–00:30" }, ["opening_hours"]),
  ["opening_hours"],
  "Changed opening hours must be protected as an editorial correction."
);

const placesSync = await readFile(new URL("./syncPlacesFromRaw.ts", import.meta.url), "utf8");
assert.match(placesSync, /unlockedFields\(syncedColumns, existing\.lockedFields\)/, "sync:places must omit locked fields from its change plan.");
assert.match(placesSync, /unlockedFields\(syncedColumns, plan\.existing\?\.lockedFields/, "sync:places must omit locked fields from writes.");
assert.match(placesSync, /!plan\.existing\?\.lockedFields\.includes\("subcategories"\)/, "Locked subcategories must protect the relation table.");
assert.doesNotMatch(placesSync, /SET\s+status\s*=/, "sync:places must not reactivate archived places.");

const rankingSync = await readFile(new URL("./syncEditorialRanking.ts", import.meta.url), "utf8");
for (const field of ["offscript_pick_level", "offscript_priority", "price_level", "offscript_reason_en", "authenticity", "audience_tags", "occasion_tags", "work_friendly", "amenities"]) {
  assert.match(rankingSync, new RegExp(`${field}=CASE WHEN NOT \\('${field}'=ANY\\(editorial_locked_fields\\)\\)`), `${field} must survive sync:editorial-ranking when locked.`);
}
assert.doesNotMatch(rankingSync, /SET\s+status\s*=/, "sync:editorial-ranking must not reactivate archived places.");

const repository = await readFile(new URL("../src/data/placesAdminRepository.ts", import.meta.url), "utf8");
assert.match(repository, /changedEditorialFields\(current, submitted, EDITORIAL_EDITABLE_FIELDS\)/);
assert.match(repository, /editorial_locked_fields=.*editorial_locked_fields/);
assert.match(repository, /array_remove\(editorial_locked_fields,\$1\)/);
assert.match(repository, /status_before_archive=CASE WHEN status <> 'archived'/);
assert.match(repository, /status=COALESCE\(NULLIF\(status_before_archive,'archived'\),'draft'\)/);
assert.match(repository, /"opening_hours"/, "Opening hours must be an editable, lockable editorial field.");

const recommendations = await readFile(new URL("../src/data/placesRepository.ts", import.meta.url), "utf8");
assert.match(recommendations, /p\.status <> 'archived'/, "Archived places must not be recommended.");

console.log("Editorial field locking, sync protection, subcategory protection and archive checks passed.");
