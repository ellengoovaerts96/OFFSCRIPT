import assert from "node:assert/strict";
import { acceptsBroaderLocationInContext, buildUserContext } from "../src/ai/buildUserContext.js";

// Exercise the deterministic path without external API calls.
process.env.OPENAI_API_KEY = "";
const question = "Ik heb nog geen sterke TUUTI-pick in Yoff. Wil je naar een andere buurt in Dakar gaan? Dan kan ik breder zoeken.";
const initial = await buildUserContext({
  message: "Waar kan ik padel spelen?",
  previousContext: { language: "nl", currentLocation: "Yoff", targetRegion: "Yoff" }
});
assert.equal(initial.context.intent, "sports");
assert.equal(initial.context.requestedSubcategory, "padel");

for (const message of ["oké", "Oké!", "oke", "ok", "okay"]) {
  assert.equal(acceptsBroaderLocationInContext(message, question), true);
  assert.equal(acceptsBroaderLocationInContext(message, "Hoe gaat het?"), false);
  assert.equal(acceptsBroaderLocationInContext(message), false);
  const result = await buildUserContext({
    message,
    previousContext: initial.context,
    previousAssistantMessage: question
  });
  assert.equal(result.route, "place_lookup");
  assert.equal(result.context.targetRegion, "Dakar");
  assert.equal(result.context.currentLocation, "Yoff");
  assert.equal(result.context.intent, "sports");
  assert.equal(result.context.requestedSubcategory, "padel");
  assert.equal(result.context.searchProfile?.mobility, "dakar_wide");
}
assert.equal(acceptsBroaderLocationInContext("nee", question), false);
assert.equal(acceptsBroaderLocationInContext("oké, maar niet buiten Yoff", question), false);
console.log("Broader-location reply checks passed.");

const located = await buildUserContext({
  message: "almadies",
  previousContext: initial.context,
  previousAssistantMessage: "In welke buurt ben je nu?"
});
assert.equal(located.context.intent, "sports");
assert.equal(located.context.requestedSubcategory, "padel");
assert.equal(located.context.targetRegion, "Almadies");
