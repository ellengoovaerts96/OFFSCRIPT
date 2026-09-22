import assert from "node:assert/strict";
import {
  assessmentAudienceTags,
  assessmentAudienceIsExplicitlyMixed,
  assessmentInteger,
  assessmentOccasionTags,
  assessmentWorkFriendly
} from "../src/logic/fieldNotesAssessment.js";
import { readFile } from "node:fs/promises";

assert.equal(assessmentInteger("-2 — Entièrement locale", -2, 2, "food_orientation"), -2);
assert.equal(assessmentInteger("3 — Authentique", 0, 4, "authenticity"), 3);
assert.equal(assessmentInteger("Non applicable / inconnu", -2, 2, "food_orientation"), null);
assert.equal(assessmentInteger("95", 0, 100, "offscript_priority"), 95);
assert.throws(() => assessmentInteger("105", 0, 100, "offscript_priority"));
assert.throws(() => assessmentInteger("très élevé", 0, 100, "offscript_priority"));
assert.deepEqual(assessmentAudienceTags("Habitants / locaux, Expatriés africains, Expatriés internationaux"), ["locals", "expats"]);
assert.deepEqual(assessmentAudienceTags("Expatriés, Public mixte"), ["expats"]);
assert.equal(assessmentAudienceIsExplicitlyMixed("Expatriés, Public mixte"), true);
assert.deepEqual(assessmentOccasionTags("En couple, Musique live, Petit budget"), ["couple", "live_music", "budget_friendly"]);
assert.equal(assessmentWorkFriendly("Oui"), true);
assert.equal(assessmentWorkFriendly("Non"), false);
assert.equal(assessmentWorkFriendly("Non évalué"), null);

const processor = await readFile(new URL("./processFieldNotes.ts", import.meta.url), "utf8");
const importer = await readFile(new URL("./syncStructuredImport.ts", import.meta.url), "utf8");
assert.match(processor, /"tuuti_pick_level"/);
assert.match(processor, /"tuuti_priority"/);
assert.match(processor, /"tuuti_reason_en"/);
assert.match(processor, /tuuti_pick_level: "offscript_pick_level"/);
assert.match(importer, /offscript_pick_level: "tuuti_pick_level"/);
assert.match(importer, /offscript_priority: "tuuti_priority"/);
assert.match(importer, /offscript_reason_en: "tuuti_reason_en"/);

console.log("Field Notes assessment normalization checks passed.");
