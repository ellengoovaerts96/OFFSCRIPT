import "dotenv/config";
import { createSign } from "node:crypto";

type FormItem = Record<string, unknown> & { itemId?: string; title?: string; description?: string };
type GoogleForm = { revisionId?: string; linkedSheetId?: string; info?: { title?: string; description?: string }; items?: FormItem[] };

const replaceBrand = (value: string | null | undefined): string | null | undefined =>
  value?.replace(/offscript/gi, "TUUTI");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}

function brandedItem(item: FormItem): FormItem {
  return JSON.parse(JSON.stringify(item).replace(/offscript/gi, "TUUTI")) as FormItem;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

async function accessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/forms.body https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const body = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description ?? `Google OAuth failed (${response.status}).`);
  return body.access_token;
}

async function googleJson<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init, signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) }
  });
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Google API failed (${response.status}).`);
  return body;
}

async function main(): Promise<void> {
  const formId = required("GOOGLE_FIELD_NOTES_FORM_ID");
  const spreadsheetId = required("GOOGLE_FIELD_NOTES_SPREADSHEET_ID");
  console.log("Authorizing Google service account...");
  const token = await accessToken(required("GOOGLE_SERVICE_ACCOUNT_EMAIL"), required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"));
  console.log("Reading the existing Field Notes Form...");
  const form = await googleJson<GoogleForm>(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`, token);
  if (form.linkedSheetId !== spreadsheetId) throw new Error("Refusing to update: the Form is not linked to the configured Field Notes spreadsheet.");
  if (!form.revisionId) throw new Error("Form revision ID is unavailable.");
  const documentTitle = (form.info as { documentTitle?: string } | undefined)?.documentTitle;
  if (documentTitle && /offscript/i.test(documentTitle)) {
    await googleJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(formId)}?fields=id,name`, token, {
      method: "PATCH", body: JSON.stringify({ name: replaceBrand(documentTitle) })
    });
  }

  const requests: Array<Record<string, unknown>> = [];
  if (/offscript/i.test(`${form.info?.title ?? ""} ${form.info?.description ?? ""}`)) {
    requests.push({ updateFormInfo: { info: { title: replaceBrand(form.info?.title), description: replaceBrand(form.info?.description) }, updateMask: "title,description" } });
  }
  for (const [index, item] of (form.items ?? []).entries()) {
    if (!/offscript/i.test(JSON.stringify(item))) continue;
    requests.push({ updateItem: { item: brandedItem(item), location: { index }, updateMask: "title,description,questionItem,pageBreakItem" } });
  }
  if (requests.length) {
    console.log(`Updating ${requests.length} Form item(s)...`);
    await googleJson(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}:batchUpdate`, token, {
      method: "POST", body: JSON.stringify({ requests, writeControl: { requiredRevisionId: form.revisionId } })
    });
  }

  const metadata = await googleJson<{ sheets?: Array<{ properties?: { title?: string } }> }>(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`, token);
  console.log("Checking Sheet headers...");
  let changedHeaders = 0;
  for (const sheet of metadata.sheets ?? []) {
    const title = sheet.properties?.title;
    if (!title) continue;
    const range = `'${title.replaceAll("'", "''")}'!1:1`;
    const response = await googleJson<{ values?: unknown[][] }>(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`, token);
    const headers = (response.values?.[0] ?? []).map(String);
    const branded = headers.map((header) => replaceBrand(header) ?? header);
    if (JSON.stringify(headers) === JSON.stringify(branded)) continue;
    const target = `'${title.replaceAll("'", "''")}'!A1`;
    await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(target)}?valueInputOption=RAW`, token, {
      method: "PUT", body: JSON.stringify({ values: [branded] })
    });
    changedHeaders += headers.filter((header, index) => header !== branded[index]).length;
  }

  const verifiedForm = await googleJson<GoogleForm>(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`, token);
  const visibleForm = { title: verifiedForm.info?.title, description: verifiedForm.info?.description, items: verifiedForm.items };
  if (/offscript/i.test(JSON.stringify(visibleForm))) throw new Error("Form verification found remaining OFFSCRIPT wording.");
  console.log(`TUUTI branding verified: ${requests.length} Form update(s), ${changedHeaders} Sheet header(s) renamed; response destination unchanged.`);
}

main().catch((error) => {
  console.error("Field Notes branding update failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
