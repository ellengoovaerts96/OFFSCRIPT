import { Router, type Request } from "express";
import QRCode from "qrcode";
import {
  getSourceById,
  listSources,
  updateSource
} from "../data/sourcesRepository.js";
import {
  adminCsrfToken,
  requireAdminBasicAuth,
  requireAdminCsrf
} from "../middleware/adminBasicAuth.js";
import type { SourceFilters } from "../types/source.js";
import {
  createSourceWithGeneratedCode,
  parseSourceForm,
  sourceUniqueConflict
} from "../logic/sourceAdmin.js";
import { publicSourceUrl } from "../logic/sourceAdminUrl.js";
import {
  renderSourceDetail,
  renderSourceForm,
  renderSourcesList,
  sourceType,
  sourceValues
} from "../logic/sourcesAdminHtml.js";

export const sourcesAdminRouter = Router();
sourcesAdminRouter.use(requireAdminBasicAuth);

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sourceFilters(req: Request): SourceFilters {
  const activeValue = queryString(req.query.active);
  const requestedType = queryString(req.query.source_type);
  return {
    search: queryString(req.query.search),
    active: activeValue === "true" ? true : activeValue === "false" ? false : undefined,
    sourceType: requestedType ? sourceType(requestedType) : undefined,
    neighbourhood: queryString(req.query.neighbourhood)
  };
}

function sourceId(req: Request): string | null {
  const id = String(req.params.id ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function publicOrigin(req: Request): string {
  const configured = process.env.TWILIO_WEBHOOK_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function sourceFormError(error: unknown): Record<string, string> {
  const conflict = sourceUniqueConflict(error);
  if (conflict === "slug") return { slug: "That slug is already used by another source." };
  if (conflict === "code") return { form: "A unique source code could not be generated. Please try again." };
  return { form: "The source could not be saved. Please try again." };
}

sourcesAdminRouter.get("/", async (req, res) => {
  try {
    const filters = sourceFilters(req);
    const sources = await listSources(filters);
    res.type("html").send(renderSourcesList({ sources, filters }));
  } catch (error) {
    console.error("Sources admin list failed", error);
    res.status(500).send("Sources could not be loaded.");
  }
});

sourcesAdminRouter.get("/new", (_req, res) => {
  res.type("html").send(renderSourceForm({
    mode: "create",
    values: sourceValues(),
    csrfToken: adminCsrfToken()
  }));
});

sourcesAdminRouter.post("/", requireAdminCsrf, async (req, res) => {
  const parsed = parseSourceForm(req.body as Record<string, unknown>);
  if (!parsed.success) {
    res.status(400).type("html").send(renderSourceForm({
      mode: "create",
      values: parsed.values,
      errors: parsed.errors,
      csrfToken: adminCsrfToken()
    }));
    return;
  }

  try {
    const source = await createSourceWithGeneratedCode(parsed.data);
    res.redirect(303, `/admin/sources/${encodeURIComponent(source.id)}`);
  } catch (error) {
    console.error("Sources admin create failed", sourceUniqueConflict(error) ?? "database_error");
    res.status(409).type("html").send(renderSourceForm({
      mode: "create",
      values: {
        name: parsed.data.name,
        sourceType: parsed.data.sourceType,
        slug: parsed.data.slug,
        homeNeighbourhood: parsed.data.homeNeighbourhood ?? "",
        latitude: parsed.data.latitude?.toString() ?? "",
        longitude: parsed.data.longitude?.toString() ?? "",
        active: parsed.data.active
      },
      errors: sourceFormError(error),
      csrfToken: adminCsrfToken()
    }));
  }
});

sourcesAdminRouter.get("/:id/edit", async (req, res) => {
  const id = sourceId(req);
  const source = id ? await getSourceById(id) : null;
  if (!source) {
    res.status(404).send("Source not found.");
    return;
  }
  res.type("html").send(renderSourceForm({
    mode: "edit",
    source,
    values: sourceValues(source),
    csrfToken: adminCsrfToken()
  }));
});

sourcesAdminRouter.post("/:id", requireAdminCsrf, async (req, res) => {
  const id = sourceId(req);
  const existing = id ? await getSourceById(id) : null;
  if (!existing || !id) {
    res.status(404).send("Source not found.");
    return;
  }

  const parsed = parseSourceForm(req.body as Record<string, unknown>);
  if (!parsed.success) {
    res.status(400).type("html").send(renderSourceForm({
      mode: "edit",
      source: existing,
      values: parsed.values,
      errors: parsed.errors,
      csrfToken: adminCsrfToken()
    }));
    return;
  }

  try {
    await updateSource(id, parsed.data);
    res.redirect(303, `/admin/sources/${encodeURIComponent(id)}`);
  } catch (error) {
    console.error("Sources admin update failed", sourceUniqueConflict(error) ?? "database_error");
    res.status(409).type("html").send(renderSourceForm({
      mode: "edit",
      source: existing,
      values: {
        name: parsed.data.name,
        sourceType: parsed.data.sourceType,
        slug: parsed.data.slug,
        homeNeighbourhood: parsed.data.homeNeighbourhood ?? "",
        latitude: parsed.data.latitude?.toString() ?? "",
        longitude: parsed.data.longitude?.toString() ?? "",
        active: parsed.data.active
      },
      errors: sourceFormError(error),
      csrfToken: adminCsrfToken()
    }));
  }
});

sourcesAdminRouter.get("/:id/qr.png", async (req, res) => {
  const id = sourceId(req);
  const source = id ? await getSourceById(id) : null;
  if (!source) {
    res.status(404).send("Source not found.");
    return;
  }
  try {
    const url = publicSourceUrl(source.slug, publicOrigin(req));
    const png = await QRCode.toBuffer(url, { type: "png", width: 640, margin: 2, errorCorrectionLevel: "M" });
    if (req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="tuuti-${source.slug}-qr.png"`);
    }
    res.type("png").send(png);
  } catch (error) {
    console.error("Source QR generation failed", error);
    res.status(500).send("QR code could not be generated.");
  }
});

sourcesAdminRouter.get("/:id", async (req, res) => {
  const id = sourceId(req);
  const source = id ? await getSourceById(id) : null;
  if (!source) {
    res.status(404).send("Source not found.");
    return;
  }
  res.type("html").send(renderSourceDetail({
    source,
    publicUrl: publicSourceUrl(source.slug, publicOrigin(req))
  }));
});
