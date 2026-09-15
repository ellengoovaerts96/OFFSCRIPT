import assert from "node:assert/strict";
import {
  assessmentAudienceTags,
  assessmentAudienceIsExplicitlyMixed,
  assessmentInteger,
  assessmentOccasionTags,
  assessmentWorkFriendly
} from "../src/logic/fieldNotesAssessment.js";

assert.equal(assessmentInteger("-2 — Entièrement locale", -2, 2, "food_orientation"), -2);
assert.equal(assessmentInteger("3 — Authentique", 0, 4, "authenticity"), 3);
assert.equal(assessmentInteger("Non applicable / inconnu", -2, 2, "food_orientation"), null);
assert.equal(assessmentInteger("95", 0, 100, "offscript_priority"), 95);
assert.throws(() => assessmentInteger("105", 0, 100, "offscript_priority"));
assert.throws(() => assessmentInteger("très élevé", 0, 100, "offscript_priority"));
assert.deepEqual(assessmentAudienceTags("Habitants / locaux, Expatriés africains, Expatriés internationaux"), ["locals", "african_expats", "international_expats"]);
assert.deepEqual(assessmentAudienceTags("Expatriés, Public mixte"), ["expats"]);
assert.equal(assessmentAudienceIsExplicitlyMixed("Expatriés, Public mixte"), true);
assert.deepEqual(assessmentOccasionTags("En couple, Musique live, Petit budget"), ["couple", "live_music", "budget_friendly"]);
assert.equal(assessmentWorkFriendly("Oui"), true);
assert.equal(assessmentWorkFriendly("Non"), false);
assert.equal(assessmentWorkFriendly("Non évalué"), null);

console.log("Field Notes assessment normalization checks passed.");
