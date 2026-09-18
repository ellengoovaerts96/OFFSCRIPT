import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { renderDashboard, renderStagingTest } from "../src/logic/dashboardHtml.js";

const html = renderDashboard({
  environment: "STAGING",
  productionOrigin: "https://production.example",
  stagingOrigin: "",
  fieldResearchFormUrl: "https://forms.example/research",
  fieldResearchInboxUrl: "https://sheets.example/inbox"
});

assert.match(html, /TUUTI/);
assert.match(html, /tuuti_logo_night_version_transparent\.png/);
assert.match(html, /rel="manifest" href="\/admin-assets\/manifest\.webmanifest"/);
assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/admin-assets\/tuuti-dashboard-180\.png"/);
assert.match(html, /alt="TUUTI"/);
assert.match(html, /Operations/);
assert.match(html, /STAGING/);
assert.match(html, /href="\/inbox"/);
assert.match(html, /href="\/admin\/sources"/);
assert.match(html, /https:\/\/production\.example\/inbox/);
assert.match(html, /https:\/\/forms\.example\/research/);
assert.match(html, /href="\/admin\/places"/);
assert.match(html, /Manage places/);
assert.match(html, /href="\/admin\/test"/);
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

const testHtml = renderStagingTest();
assert.match(testHtml, /Test TUUTI/);
assert.match(testHtml, /STAGING/);
assert.match(testHtml, /fetch\('\/chat\/test'/);
assert.match(testHtml, /Nothing here reaches production/);

const manifest = JSON.parse(await readFile(new URL("../public/admin-assets/manifest.webmanifest", import.meta.url), "utf8"));
assert.equal(manifest.name, "TUUTI Dashboard");
assert.equal(manifest.start_url, "/admin");
assert.equal(manifest.scope, "/admin");
assert.equal(manifest.display, "standalone");
assert.deepEqual(manifest.icons.map((icon: { sizes: string }) => icon.sizes), ["192x192", "512x512"]);
for (const file of ["tuuti-dashboard-icon.jpg", "tuuti-dashboard-180.png", "tuuti-dashboard-192.png", "tuuti-dashboard-512.png"]) {
  assert.ok((await stat(new URL(`../public/admin-assets/${file}`, import.meta.url))).size > 0);
}

console.log("TUUTI dashboard rendering checks passed.");
