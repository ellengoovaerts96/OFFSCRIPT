import assert from "node:assert/strict";
import { renderDashboard } from "../src/logic/dashboardHtml.js";

const html = renderDashboard({
  environment: "STAGING",
  productionOrigin: "https://production.example",
  stagingOrigin: "",
  fieldResearchFormUrl: "https://forms.example/research",
  fieldResearchInboxUrl: "https://sheets.example/inbox"
});

assert.match(html, /TUUTI/);
assert.match(html, /Operations/);
assert.match(html, /STAGING/);
assert.match(html, /href="\/inbox"/);
assert.match(html, /href="\/admin\/sources"/);
assert.match(html, /https:\/\/production\.example\/inbox/);
assert.match(html, /https:\/\/forms\.example\/research/);
assert.match(html, /Coming soon/);
assert.doesNotMatch(html, /DATABASE_URL|TWILIO_AUTH_TOKEN|INBOX_PASSWORD/);

const unconfiguredHtml = renderDashboard({
  environment: "UNKNOWN",
  productionOrigin: "https://production.example",
  stagingOrigin: null,
  fieldResearchFormUrl: "https://forms.example/research",
  fieldResearchInboxUrl: "https://sheets.example/inbox"
});
assert.match(unconfiguredHtml, /Set TUUTI_STAGING_BASE_URL/);
assert.doesNotMatch(unconfiguredHtml, /href="\/inbox"/);

console.log("TUUTI dashboard rendering checks passed.");
