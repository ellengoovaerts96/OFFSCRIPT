import "dotenv/config";
import { google, forms_v1 } from "googleapis";

const replaceBrand = (value: string | null | undefined): string | null | undefined =>
  value?.replace(/offscript/gi, "TUUTI");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}

function brandedItem(item: forms_v1.Schema$Item): forms_v1.Schema$Item {
  return JSON.parse(JSON.stringify(item).replace(/offscript/gi, "TUUTI")) as forms_v1.Schema$Item;
}

async function main(): Promise<void> {
  const formId = required("GOOGLE_FIELD_NOTES_FORM_ID");
  const spreadsheetId = required("GOOGLE_FIELD_NOTES_SPREADSHEET_ID");
  const auth = new google.auth.JWT({
    email: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/forms.body", "https://www.googleapis.com/auth/spreadsheets"]
  });
  const forms = google.forms({ version: "v1", auth });
  const sheets = google.sheets({ version: "v4", auth });
  const form = (await forms.forms.get({ formId }, { timeout: 20_000 })).data;
  if (form.linkedSheetId !== spreadsheetId) throw new Error("Refusing to update: the Form is not linked to the configured Field Notes spreadsheet.");
  if (!form.revisionId) throw new Error("Form revision ID is unavailable.");

  const requests: forms_v1.Schema$Request[] = [];
  if (/offscript/i.test(`${form.info?.title ?? ""} ${form.info?.description ?? ""}`)) {
    requests.push({ updateFormInfo: { info: { title: replaceBrand(form.info?.title), description: replaceBrand(form.info?.description) }, updateMask: "title,description" } });
  }
  for (const [index, item] of (form.items ?? []).entries()) {
    if (!/offscript/i.test(JSON.stringify(item))) continue;
    requests.push({ updateItem: { item: brandedItem(item), location: { index }, updateMask: "title,description,questionItem,pageBreakItem" } });
  }
  if (requests.length) {
    await forms.forms.batchUpdate({ formId, requestBody: { requests, writeControl: { requiredRevisionId: form.revisionId } } }, { timeout: 20_000 });
  }

  const metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" }, { timeout: 20_000 })).data;
  let changedHeaders = 0;
  for (const sheet of metadata.sheets ?? []) {
    const title = sheet.properties?.title;
    if (!title) continue;
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${title.replaceAll("'", "''")}'!1:1` }, { timeout: 20_000 });
    const headers = (response.data.values?.[0] ?? []).map(String);
    const branded = headers.map((header) => replaceBrand(header) ?? header);
    if (JSON.stringify(headers) === JSON.stringify(branded)) continue;
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `'${title.replaceAll("'", "''")}'!A1`, valueInputOption: "RAW", requestBody: { values: [branded] } }, { timeout: 20_000 });
    changedHeaders += headers.filter((header, index) => header !== branded[index]).length;
  }

  const verifiedForm = (await forms.forms.get({ formId }, { timeout: 20_000 })).data;
  if (/offscript/i.test(JSON.stringify({ info: verifiedForm.info, items: verifiedForm.items }))) throw new Error("Form verification found remaining OFFSCRIPT wording.");
  console.log(`TUUTI branding verified: ${requests.length} Form update(s), ${changedHeaders} Sheet header(s) renamed; response destination unchanged.`);
}

main().catch((error) => {
  console.error("Field Notes branding update failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
