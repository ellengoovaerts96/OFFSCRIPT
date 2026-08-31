import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import QRCode from "qrcode";
import { adminCsrfToken, requireAdminBasicAuth, requireAdminCsrf } from "../src/middleware/adminBasicAuth.js";
import {
  createSourceWithGeneratedCode,
  generateSourceCode,
  parseSourceForm,
  slugifySourceName
} from "../src/logic/sourceAdmin.js";
import { publicSourceUrl } from "../src/logic/sourceAdminUrl.js";
import { renderSourceDetail, renderSourcesList } from "../src/logic/sourcesAdminHtml.js";
import type { AcquisitionSource, SourceAcquisitionSummary } from "../src/types/source.js";

type MockResponse = {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  status: (code: number) => MockResponse;
  send: (body: string) => MockResponse;
  setHeader: (name: string, value: string) => void;
};

function response(): MockResponse {
  return {
    statusCode: 200,
    body: "",
    headers: {},
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; }
  };
}

const previousUsername = process.env.INBOX_USERNAME;
const previousPassword = process.env.INBOX_PASSWORD;
try {
  process.env.INBOX_USERNAME = "ellen";
  process.env.INBOX_PASSWORD = "pilot-secret";

  const rejected = response();
  let rejectedNext = false;
  requireAdminBasicAuth({ headers: {} } as never, rejected as never, () => { rejectedNext = true; });
  assert.equal(rejected.statusCode, 401);
  assert.equal(rejectedNext, false);

  const accepted = response();
  let acceptedNext = false;
  const authorization = `Basic ${Buffer.from("ellen:pilot-secret").toString("base64")}`;
  requireAdminBasicAuth({ headers: { authorization } } as never, accepted as never, () => { acceptedNext = true; });
  assert.equal(acceptedNext, true);

  const csrfRejected = response();
  requireAdminCsrf({ body: { _csrf: "wrong" } } as never, csrfRejected as never, () => assert.fail("Invalid CSRF must not pass."));
  assert.equal(csrfRejected.statusCode, 403);
  let csrfAccepted = false;
  requireAdminCsrf({ body: { _csrf: adminCsrfToken() } } as never, response() as never, () => { csrfAccepted = true; });
  assert.equal(csrfAccepted, true);
} finally {
  if (previousUsername === undefined) delete process.env.INBOX_USERNAME;
  else process.env.INBOX_USERNAME = previousUsername;
  if (previousPassword === undefined) delete process.env.INBOX_PASSWORD;
  else process.env.INBOX_PASSWORD = previousPassword;
}
console.log("Admin authentication and form protection checks passed.");

assert.equal(slugifySourceName("  Villa Île de Ngor  "), "villa-ile-de-ngor");
const parsed = parseSourceForm({
  name: "Villa Île de Ngor",
  source_type: "accommodation",
  slug: "",
  home_neighbourhood: "Ngor",
  latitude: "14.75",
  longitude: "-17.51",
  active: "on"
});
assert.equal(parsed.success, true);
if (!parsed.success) assert.fail("Valid source form should parse.");
assert.equal(parsed.data.slug, "villa-ile-de-ngor");
assert.equal(parsed.data.active, true);
assert.equal(parseSourceForm({ name: "Hotel", source_type: "accommodation", home_neighbourhood: "", active: "on", slug: "" }).success, false);
assert.equal(parseSourceForm({ name: "Hotel", source_type: "accommodation", home_neighbourhood: "Ngor", active: "on", slug: "Bad Slug" }).success, false);
assert.equal(parseSourceForm({ name: "Hotel", source_type: "accommodation", home_neighbourhood: "Ngor", active: "on", slug: "hotel", latitude: "91" }).success, false);
console.log("Source form and slug validation checks passed.");

const generatedCodes = new Set(Array.from({ length: 500 }, generateSourceCode));
assert.equal(generatedCodes.size, 500);
assert.ok([...generatedCodes].every((code) => /^[A-Z2-9]{8}$/.test(code)));

let createAttempts = 0;
const created = await createSourceWithGeneratedCode(parsed.data, async (input) => {
  createAttempts += 1;
  if (createAttempts === 1) throw { code: "23505", constraint: "sources_code_lower_unique_idx" };
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    ...input,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  } satisfies AcquisitionSource;
});
assert.equal(createAttempts, 2);
assert.equal(created.id, "550e8400-e29b-41d4-a716-446655440000");
console.log("Random code generation and collision retry checks passed.");

const summary: SourceAcquisitionSummary = {
  ...created,
  code: "N7K4Q2AB",
  active: false,
  acquiredUserCount: 31,
  firstAcquiredAt: "2026-08-01T00:00:00.000Z",
  latestAcquiredAt: "2026-08-30T00:00:00.000Z"
};
const listHtml = renderSourcesList({ sources: [summary], filters: {} });
assert.match(listHtml, /Inactive/);
assert.match(listHtml, /31 acquired/);
const url = publicSourceUrl(summary.slug, "https://tuuti.example/");
assert.equal(url, "https://tuuti.example/go/villa-ile-de-ngor");
const detailHtml = renderSourceDetail({ source: summary, publicUrl: url });
assert.match(detailHtml, /Start TUUTI · SRC:N7K4Q2AB/);
assert.doesNotMatch(detailHtml, /whatsapp:\+|user_phone/i);
const qrPng = await QRCode.toBuffer(url, { type: "png" });
assert.equal(qrPng.subarray(1, 4).toString(), "PNG");
console.log("Admin rendering, privacy, metrics and QR target checks passed.");

const repository = await readFile(new URL("../src/data/sourcesRepository.ts", import.meta.url), "utf8");
const updateStatement = repository.match(/UPDATE public\.sources[\s\S]*?RETURNING[\s\S]*?updated_at/)?.[0] ?? "";
assert.ok(updateStatement);
assert.doesNotMatch(updateStatement, /SET[\s\S]*?\bcode\s*=/i, "Normal edits must not change source code.");
assert.match(repository, /ORDER BY s\.active DESC, lower\(s\.name\) ASC/);
const adminRouter = await readFile(new URL("../src/channels/sourcesAdmin.ts", import.meta.url), "utf8");
assert.match(adminRouter, /sourcesAdminRouter\.use\(requireAdminBasicAuth\)/);
assert.doesNotMatch(adminRouter, /deleteSource|DELETE FROM/i);
assert.match(adminRouter, /QRCode\.toBuffer\(url/);
console.log("Stable identity, no-delete and protected-route checks passed.");
