import { Router, type Request, type Response } from "express";
import multer from "multer";
import { adminCsrfToken, requireAdminBasicAuth, requireAdminCsrf } from "../middleware/adminBasicAuth.js";
import { cloudinaryConfigured, uploadEventScreenshot } from "../integrations/cloudinary.js";
import { hasOpenAIKey } from "../integrations/openai.js";
import { extractEventScreenshot } from "../ai/extractEventScreenshot.js";
import { getAdminEvent, listAdminEvents, listEventVenues, saveAdminEvent } from "../data/eventsRepository.js";
import { emptyEvent, extractionToEvent, matchEventVenue, parseEventContext, safeSourceUrl, screenshotFormat, sourceTypes, validateEvent, type EventData } from "../logic/eventImport.js";
import { newEventDraft, readEventDraft, signEventDraft, type EventDraft } from "../logic/eventImportDraft.js";
import { renderEventImport, renderEventReview, renderEventsList } from "../logic/eventsAdminHtml.js";

export const eventsAdminRouter = Router();
eventsAdminRouter.use(requireAdminBasicAuth);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 12 * 1024 * 1024, fields: 10, fieldSize: 10000 } }).single("screenshot");
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
function importPage(res: Response, status = 200, error?: string, values?: Record<string, unknown>): void {
  res.status(status).type("html").send(renderEventImport({ csrf: adminCsrfToken(), error, values, cloudinaryReady: cloudinaryConfigured(), openaiReady: hasOpenAIKey() }));
}
async function reviewPage(res: Response, draft: EventDraft, data: Partial<EventData>, error?: string, status = 200): Promise<void> {
  res.status(status).type("html").send(renderEventReview({ csrf: adminCsrfToken(), token: signEventDraft(draft),
    data, source: draft.source, extraction: draft.extraction, context: draft.context, venues: await listEventVenues(), error }));
}
async function extractAndReview(res: Response, draft: EventDraft, data: EventData): Promise<void> {
  if (!draft.source) throw new Error("Upload a screenshot first.");
  let error: string | undefined;
  try {
    draft.extraction = await extractEventScreenshot(draft.source.previewUrl, draft.context, data.sourceType);
    const selectedSourceType = data.sourceType;
    data = extractionToEvent(draft.extraction, data.sourceUrl);
    if (selectedSourceType !== "unknown") data.sourceType = selectedSourceType;
    const match = matchEventVenue(data.venueName, await listEventVenues());
    data.placeId = match.exact?.id ?? null;
  } catch (failure) {
    error = message(failure);
  }
  await reviewPage(res, draft, data, error);
}

eventsAdminRouter.get("/", async (_req, res) => {
  try { res.type("html").send(renderEventsList(await listAdminEvents())); }
  catch (error) { console.error("Events list failed", error); res.status(503).send("Events could not be loaded. Check that the database migration has completed."); }
});
eventsAdminRouter.get("/import", (_req, res) => importPage(res));
eventsAdminRouter.get("/new", async (_req, res) => {
  try { await reviewPage(res, newEventDraft(), emptyEvent()); }
  catch (error) { console.error("Event form failed", error); importPage(res, 503, "The event form could not be loaded. Please try again."); }
});
eventsAdminRouter.post("/import", (req, res, next) => {
  upload(req, res, error => {
    if (error) { importPage(res, 400, error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? "The screenshot is too large. Maximum size: 12 MB." : "Upload one PNG, JPG or HEIC screenshot up to 12 MB."); return; }
    next();
  });
}, requireAdminCsrf, async (req, res) => {
  let draft: EventDraft | undefined;
  let data = emptyEvent();
  try {
    if (!req.file) throw new Error("Choose a screenshot to upload.");
    const format = screenshotFormat(req.file.buffer);
    const context = parseEventContext(req.body);
    data.sourceUrl = safeSourceUrl(req.body.sourceUrl);
    if (!sourceTypes.includes(req.body.sourceType)) throw new Error("Choose a valid source type.");
    data.sourceType = req.body.sourceType;
    if (!cloudinaryConfigured()) throw new Error("Cloudinary is not configured. Screenshot upload is unavailable.");
    draft = newEventDraft();
    draft.context = context;
    draft.source = await uploadEventScreenshot({ buffer: req.file.buffer, filename: (req.file.originalname.split(/[\\/]/).pop() ?? "screenshot").slice(0, 255), format });
    await extractAndReview(res, draft, data);
  } catch (error) {
    console.error("Event screenshot import failed", error);
    if (draft?.source) {
      try { await reviewPage(res, draft, data, "The screenshot was uploaded, but the review could not be completed. Please try again.", 503); return; } catch { /* Fall back to the upload screen if the database is unavailable. */ }
    }
    importPage(res, 400, message(error), req.body);
  }
});
eventsAdminRouter.post("/import/retry", requireAdminCsrf, async (req, res) => {
  let draft: EventDraft | undefined;
  let data = emptyEvent();
  try {
    draft = readEventDraft(req.body.draft);
    draft.context = parseEventContext(req.body);
    draft.extraction = null;
    data.sourceUrl = safeSourceUrl(req.body.sourceUrl);
    if (!sourceTypes.includes(req.body.sourceType)) throw new Error("Choose a valid source type.");
    data.sourceType = req.body.sourceType;
    await extractAndReview(res, draft, data);
  } catch (error) {
    if (draft) { try { await reviewPage(res, draft, data, message(error), 400); return; } catch { /* render upload error below */ } }
    importPage(res, 400, message(error));
  }
});
eventsAdminRouter.get("/:id", async (req, res) => {
  if (!uuid.test(String(req.params.id))) { res.status(404).send("Event not found."); return; }
  try {
    const event = await getAdminEvent(String(req.params.id));
    if (!event) { res.status(404).send("Event not found."); return; }
    res.type("html").send(renderEventReview({ csrf: adminCsrfToken(), id: event.id, data: event.data, source: event.source,
      extraction: event.extraction?.result ?? null, context: event.extraction?.context ?? newEventDraft().context,
      venues: await listEventVenues(), saved: req.query.saved === "1" }));
  } catch (error) { console.error("Event detail failed", error); res.status(503).send("Event could not be loaded."); }
});
async function save(req: Request, res: Response): Promise<void> {
  let draft: EventDraft | undefined;
  const id = req.params.id ? String(req.params.id) : undefined;
  if (id && !uuid.test(id)) { res.status(404).send("Event not found."); return; }
  try {
    if (!id) draft = readEventDraft(req.body.draft);
    if (req.body.reviewed !== "yes") throw new Error("Please confirm that you reviewed the event details before saving.");
    const data = validateEvent(req.body);
    const savedId = await saveAdminEvent({ id, draft, data, admin: process.env.INBOX_USERNAME?.trim() || "admin" });
    res.redirect(303, `/admin/events/${savedId}?saved=1`);
  } catch (error) {
    // Form values are kept so a validation error never discards admin edits.
    const safeValues = Object.fromEntries(Object.keys(emptyEvent()).map(key => [key, typeof req.body[key] === "string" ? req.body[key] : ""]));
    try {
      if (draft) { await reviewPage(res, draft, safeValues, message(error), 400); return; }
      if (id) {
        const event = await getAdminEvent(id);
        if (event) {
          res.status(400).type("html").send(renderEventReview({ csrf: adminCsrfToken(), id, data: safeValues, source: event.source,
            extraction: event.extraction?.result ?? null, context: event.extraction?.context ?? newEventDraft().context,
            venues: await listEventVenues(), error: message(error) })); return;
        }
      }
    } catch (renderError) { console.error("Event save error rendering failed", renderError); }
    importPage(res, 400, message(error));
  }
}
eventsAdminRouter.post("/", requireAdminCsrf, save);
eventsAdminRouter.post("/:id", requireAdminCsrf, save);
