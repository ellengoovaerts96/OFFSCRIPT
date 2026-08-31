import type { SourceAcquisitionSummary, SourceFilters, SourceType } from "../types/source.js";
import { SOURCE_TYPES } from "../types/source.js";
import { KNOWN_REGIONS } from "../utils/normalizeRegion.js";
import type { SourceFormValues } from "./sourceAdmin.js";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, content: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · TUUTI Admin</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17201d; background: #f3f5f4; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; }
    header { padding: 18px max(18px, calc((100% - 1120px) / 2)); color: #fff; background: #162d26; }
    header a { color: inherit; text-decoration: none; }
    header strong { font-size: 20px; }
    header span { margin-left: 10px; color: #b8cbc4; font-size: 13px; }
    main { width: min(1120px, calc(100% - 32px)); margin: 28px auto 48px; }
    h1 { margin: 0; font-size: clamp(25px, 4vw, 34px); }
    h2 { margin: 0 0 14px; font-size: 18px; }
    p { line-height: 1.5; }
    .topbar, .actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .topbar { margin-bottom: 22px; }
    .button, button { display: inline-flex; min-height: 42px; align-items: center; justify-content: center; padding: 9px 15px; border: 1px solid #204c3d; border-radius: 8px; color: #fff; background: #204c3d; font: inherit; font-weight: 650; text-decoration: none; cursor: pointer; }
    .button.secondary, button.secondary { color: #204c3d; background: #fff; }
    .button.danger { border-color: #9b3d35; color: #9b3d35; background: #fff; }
    .panel, .source-card { border: 1px solid #d7ddda; border-radius: 12px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.035); }
    .panel { padding: 20px; margin-bottom: 20px; }
    .filters, .form-grid, .identity-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .filters { grid-template-columns: 2fr repeat(3, 1fr); align-items: end; }
    label { display: grid; gap: 7px; font-size: 13px; font-weight: 650; color: #43514c; }
    input, select { width: 100%; min-height: 43px; padding: 9px 11px; border: 1px solid #bdc7c3; border-radius: 7px; color: #17201d; background: #fff; font: inherit; }
    input:focus, select:focus, button:focus, .button:focus { outline: 3px solid #9bc4b5; outline-offset: 2px; }
    .checkbox { display: flex; align-items: center; gap: 9px; min-height: 43px; }
    .checkbox input { width: 20px; min-height: 20px; }
    .source-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); gap: 16px; }
    .source-card { padding: 18px; }
    .source-card h2 { margin-bottom: 5px; }
    .meta { color: #68736f; font-size: 14px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .badge { display: inline-flex; padding: 4px 9px; border-radius: 999px; font-size: 12px; font-weight: 750; }
    .badge.active { color: #175d42; background: #dff4e9; }
    .badge.inactive { color: #8a3932; background: #f8e3e1; }
    dl { margin: 16px 0; display: grid; grid-template-columns: minmax(110px, .7fr) 1.3fr; gap: 9px 14px; }
    dt { color: #68736f; }
    dd { margin: 0; overflow-wrap: anywhere; }
    .field-error, .error-box { color: #8a2921; }
    .field-error { font-size: 12px; font-weight: 550; }
    .error-box { padding: 12px 14px; border: 1px solid #e6aaa5; border-radius: 8px; background: #fff1f0; }
    .full { grid-column: 1 / -1; }
    .hint { color: #68736f; font-size: 12px; font-weight: 400; }
    .qr { display: block; width: min(100%, 320px); height: auto; margin: 12px auto; border: 1px solid #e0e5e3; border-radius: 10px; }
    .empty { padding: 35px 20px; text-align: center; color: #68736f; }
    @media (max-width: 760px) {
      main { width: min(100% - 24px, 1120px); margin-top: 20px; }
      .filters, .form-grid, .identity-grid { grid-template-columns: 1fr; }
      .button, button { width: 100%; }
      .actions > * { flex: 1 1 145px; }
      dl { grid-template-columns: 1fr; gap: 3px; }
      dd { margin-bottom: 9px; }
    }
  </style>
</head>
<body>
  <header><a href="/admin/sources"><strong>TUUTI Admin</strong><span>Sources</span></a></header>
  <main>${content}</main>
  <script>
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-copy]");
      if (!button) return;
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        const original = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => { button.textContent = original; }, 1200);
      } catch { button.textContent = "Copy failed"; }
    });
  </script>
</body>
</html>`;
}

function selected(value: string | undefined, candidate: string): string {
  return value === candidate ? " selected" : "";
}

function statusBadge(active: boolean): string {
  return `<span class="badge ${active ? "active" : "inactive"}">${active ? "Active" : "Inactive"}</span>`;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

export function renderSourcesList(input: {
  sources: SourceAcquisitionSummary[];
  filters: SourceFilters;
}): string {
  const sourceTypeOptions = SOURCE_TYPES.map((type) =>
    `<option value="${type}"${selected(input.filters.sourceType, type)}>${escapeHtml(type)}</option>`
  ).join("");
  const neighbourhoodOptions = KNOWN_REGIONS.map((region) =>
    `<option value="${escapeHtml(region)}"${selected(input.filters.neighbourhood, region)}>${escapeHtml(region)}</option>`
  ).join("");
  const cards = input.sources.map((source) => `
    <article class="source-card">
      <div class="topbar"><div><h2>${escapeHtml(source.name)}</h2><div class="meta">${escapeHtml(source.sourceType)} · ${escapeHtml(source.homeNeighbourhood ?? "No neighbourhood")}</div></div>${statusBadge(source.active)}</div>
      <dl>
        <dt>Slug</dt><dd class="mono">${escapeHtml(source.slug)}</dd>
        <dt>Code</dt><dd class="mono">${escapeHtml(source.code)}</dd>
        <dt>Users</dt><dd>${source.acquiredUserCount} acquired</dd>
        <dt>Created</dt><dd>${formatDate(source.createdAt)}</dd>
      </dl>
      <div class="actions"><a class="button secondary" href="/admin/sources/${encodeURIComponent(source.id)}">View / QR</a><a class="button secondary" href="/admin/sources/${encodeURIComponent(source.id)}/edit">Edit</a></div>
    </article>`).join("");

  return page("Sources", `
    <div class="topbar"><div><h1>Sources</h1><p class="meta">Accommodation and campaign entry points for TUUTI.</p></div><a class="button" href="/admin/sources/new">+ Add source</a></div>
    <form class="panel filters" method="get" action="/admin/sources">
      <label>Search<input name="search" value="${escapeHtml(input.filters.search ?? "")}" placeholder="Name, slug or code"></label>
      <label>Status<select name="active"><option value="">All</option><option value="true"${input.filters.active === true ? " selected" : ""}>Active</option><option value="false"${input.filters.active === false ? " selected" : ""}>Inactive</option></select></label>
      <label>Type<select name="source_type"><option value="">All types</option>${sourceTypeOptions}</select></label>
      <label>Neighbourhood<select name="neighbourhood"><option value="">All areas</option>${neighbourhoodOptions}</select></label>
      <div class="actions full"><button type="submit">Filter</button><a class="button secondary" href="/admin/sources">Clear</a></div>
    </form>
    ${cards ? `<div class="source-grid">${cards}</div>` : `<div class="panel empty">No sources match these filters.</div>`}
  `);
}

function inputError(errors: Record<string, string>, field: string): string {
  return errors[field] ? `<span class="field-error">${escapeHtml(errors[field])}</span>` : "";
}

export function sourceValues(source?: SourceAcquisitionSummary): SourceFormValues {
  return {
    name: source?.name ?? "",
    sourceType: source?.sourceType ?? "accommodation",
    slug: source?.slug ?? "",
    homeNeighbourhood: source?.homeNeighbourhood ?? "",
    latitude: source?.latitude?.toString() ?? "",
    longitude: source?.longitude?.toString() ?? "",
    active: source?.active ?? true
  };
}

export function renderSourceForm(input: {
  mode: "create" | "edit";
  values: SourceFormValues;
  errors?: Record<string, string>;
  csrfToken: string;
  source?: SourceAcquisitionSummary;
}): string {
  const errors = input.errors ?? {};
  const action = input.mode === "create" ? "/admin/sources" : `/admin/sources/${encodeURIComponent(input.source?.id ?? "")}`;
  const typeOptions = SOURCE_TYPES.map((type) => `<option value="${type}"${selected(input.values.sourceType, type)}>${type}</option>`).join("");
  const neighbourhoodOptions = KNOWN_REGIONS.map((region) => `<option value="${escapeHtml(region)}"${selected(input.values.homeNeighbourhood, region)}>${escapeHtml(region)}</option>`).join("");

  return page(input.mode === "create" ? "Add source" : "Edit source", `
    <div class="topbar"><div><h1>${input.mode === "create" ? "Add source" : `Edit ${escapeHtml(input.source?.name)}`}</h1><p class="meta">${input.mode === "create" ? "Codes are generated automatically and remain stable." : "The technical code and source ID will not change."}</p></div><a class="button secondary" href="${input.source ? `/admin/sources/${encodeURIComponent(input.source.id)}` : "/admin/sources"}">Cancel</a></div>
    ${errors.form ? `<p class="error-box">${escapeHtml(errors.form)}</p>` : ""}
    <form class="panel form-grid" method="post" action="${action}">
      <input type="hidden" name="_csrf" value="${escapeHtml(input.csrfToken)}">
      <label>Name<input name="name" required maxlength="160" value="${escapeHtml(input.values.name)}">${inputError(errors, "name")}</label>
      <label>Source type<select name="source_type" required>${typeOptions}</select>${inputError(errors, "sourceType")}</label>
      <label>Neighbourhood<select name="home_neighbourhood"><option value="">No neighbourhood</option>${neighbourhoodOptions}</select><span class="hint">Required for accommodation.</span>${inputError(errors, "homeNeighbourhood")}</label>
      <label>Slug<input name="slug" maxlength="160" value="${escapeHtml(input.values.slug)}" placeholder="Automatically generated when blank"><span class="hint">Lowercase letters, numbers and hyphens.</span>${inputError(errors, "slug")}</label>
      ${input.source ? `<label>Code<input value="${escapeHtml(input.source.code)}" readonly><span class="hint">Stable and read-only.</span></label>` : ""}
      <label>Latitude<input name="latitude" inputmode="decimal" value="${escapeHtml(input.values.latitude)}" placeholder="14.7500">${inputError(errors, "latitude")}</label>
      <label>Longitude<input name="longitude" inputmode="decimal" value="${escapeHtml(input.values.longitude)}" placeholder="-17.5100">${inputError(errors, "longitude")}</label>
      <label class="checkbox"><input type="checkbox" name="active"${input.values.active ? " checked" : ""}> Active</label>
      <div class="actions full"><button type="submit">${input.mode === "create" ? "Create source" : "Save changes"}</button></div>
    </form>
  `);
}

export function renderSourceDetail(input: {
  source: SourceAcquisitionSummary;
  publicUrl: string;
}): string {
  const source = input.source;
  const token = `Start TUUTI · SRC:${source.code}`;
  return page(source.name, `
    <div class="topbar"><div><h1>${escapeHtml(source.name)}</h1><p>${statusBadge(source.active)}</p></div><div class="actions"><a class="button secondary" href="/admin/sources">Back</a><a class="button" href="/admin/sources/${encodeURIComponent(source.id)}/edit">Edit</a></div></div>
    <section class="panel"><h2>Identity</h2><dl class="identity-grid">
      <dt>Type</dt><dd>${escapeHtml(source.sourceType)}</dd><dt>Neighbourhood</dt><dd>${escapeHtml(source.homeNeighbourhood ?? "—")}</dd>
      <dt>Slug</dt><dd class="mono">${escapeHtml(source.slug)}</dd><dt>Code</dt><dd class="mono">${escapeHtml(source.code)}</dd>
      <dt>Created</dt><dd>${formatDate(source.createdAt)}</dd><dt>Updated</dt><dd>${formatDate(source.updatedAt)}</dd>
    </dl></section>
    <section class="panel"><h2>Public link</h2><p class="mono">${escapeHtml(input.publicUrl)}</p><div class="actions"><button type="button" data-copy="${escapeHtml(input.publicUrl)}">Copy link</button><a class="button secondary" href="${escapeHtml(input.publicUrl)}" target="_blank" rel="noreferrer">Open</a></div></section>
    <section class="panel"><h2>WhatsApp start token</h2><p class="mono">${escapeHtml(token)}</p><button type="button" data-copy="${escapeHtml(token)}">Copy token</button></section>
    <section class="panel"><h2>QR code</h2><p class="meta">This QR encodes the public TUUTI source link, not a hard-coded WhatsApp URL.</p><img class="qr" src="/admin/sources/${encodeURIComponent(source.id)}/qr.png" alt="QR code for ${escapeHtml(source.name)}"><a class="button" href="/admin/sources/${encodeURIComponent(source.id)}/qr.png?download=1">Download PNG</a></section>
    <section class="panel"><h2>Acquisition</h2><dl><dt>Acquired users</dt><dd><strong>${source.acquiredUserCount}</strong></dd><dt>First acquisition</dt><dd>${formatDate(source.firstAcquiredAt)}</dd><dt>Latest acquisition</dt><dd>${formatDate(source.latestAcquiredAt)}</dd></dl><p class="meta">Only aggregate counts are shown. Phone numbers and chat content are never displayed here.</p></section>
  `);
}

export function sourceType(value: string): SourceType | undefined {
  return SOURCE_TYPES.includes(value as SourceType) ? value as SourceType : undefined;
}
