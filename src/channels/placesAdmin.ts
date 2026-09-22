import { Router } from "express";
import multer from "multer";
import { addDashboardPlaceImage, archivePlace, EDITORIAL_EDITABLE_FIELDS, getPlaceForAdmin, listPlacesForAdmin, placeAdminFilterOptions, removePlaceImageRelationship, removePlaceVideoRelationship, reorderPlaceImages, replaceDashboardPlaceVideo, restorePlace, setPlaceCoverImage, unlockPlaceEditorialField, updatePlaceEditorial, type EditorialEditableField, type EditorialPlaceUpdate, type PlaceAdminFilters } from "../data/placesAdminRepository.js";
import { adminCsrfToken, requireAdminBasicAuth, requireAdminCsrf } from "../middleware/adminBasicAuth.js";
import { renderPlaceAdminDetail, renderPlacesAdminList } from "../logic/placesAdminHtml.js";
import { cloudinaryConfigured, uploadPlaceJpeg, uploadPlaceVideo } from "../integrations/cloudinary.js";

export const placesAdminRouter = Router();
placesAdminRouter.use(requireAdminBasicAuth);
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 20, fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    if (file.mimetype === "image/jpeg") done(null, true);
    else done(new Error(`${file.originalname} is not a JPEG.`));
  }
});
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    if (["video/mp4", "video/quicktime", "video/webm"].includes(file.mimetype)) done(null, true);
    else done(new Error(`${file.originalname} is not a supported MP4, MOV or WebM video.`));
  }
});
const validId = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const listValue = (value: unknown): string[] => String(value ?? "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
const nullableText = (value: unknown): string | null => String(value ?? "").trim() || null;
const nullableInteger = (value: unknown, min: number, max: number, field: string): number | null => {
  if (String(value ?? "").trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${field} must be between ${min} and ${max}.`);
  return parsed;
};
const editableStatuses = new Set(["draft", "ready", "premium"]);

function editorialUpdateFromBody(body: Record<string, unknown>): EditorialPlaceUpdate {
  const status = String(body.status ?? "draft");
  if (!editableStatuses.has(status)) throw new Error("Invalid editorial status.");
  const name = String(body.name ?? "").trim();
  const googleMapsUrl = String(body.google_maps_url ?? "").trim();
  if (!name || !googleMapsUrl) throw new Error("Name and Google Maps URL are required.");
  const workFriendly = String(body.work_friendly ?? "");
  if (!["", "true", "false"].includes(workFriendly)) throw new Error("Invalid work-friendly value.");
  return {
    name,
    neighbourhood: nullableText(body.neighbourhood), area: nullableText(body.area),
    categories: listValue(body.categories), subcategories: listValue(body.subcategories),
    short_description_en: nullableText(body.short_description_en), short_description_fr: nullableText(body.short_description_fr),
    practical_info_en: nullableText(body.practical_info_en), practical_info_fr: nullableText(body.practical_info_fr),
    personal_tip_en: nullableText(body.personal_tip_en), personal_tip_fr: nullableText(body.personal_tip_fr),
    price_level: nullableInteger(body.price_level, 1, 5, "Price level"), vibe: nullableText(body.vibe),
    vibe_tags: listValue(body.vibe_tags), amenities: listValue(body.amenities),
    instagram_url: nullableText(body.instagram_url), facebook_url: nullableText(body.facebook_url),
    tiktok_url: nullableText(body.tiktok_url), google_maps_url: googleMapsUrl,
    offscript_pick_level: nullableInteger(body.offscript_pick_level, 0, 3, "TUUTI pick level") ?? 0,
    offscript_priority: nullableInteger(body.offscript_priority, 0, 100, "TUUTI priority") ?? 0,
    offscript_reason_nl: nullableText(body.offscript_reason_nl), offscript_reason_en: nullableText(body.offscript_reason_en),
    offscript_reason_fr: nullableText(body.offscript_reason_fr), authenticity: nullableInteger(body.authenticity, 0, 4, "Authenticity"),
    food_orientation: nullableInteger(body.food_orientation, -2, 2, "Food orientation"),
    audience_orientation: nullableInteger(body.audience_orientation, -2, 2, "Audience orientation"),
    audience_tags: listValue(body.audience_tags), adventure_level: nullableInteger(body.adventure_level, 0, 3, "Adventure level"),
    occasion_tags: listValue(body.occasion_tags), dietary_tags: listValue(body.dietary_tags),
    work_friendly: workFriendly === "" ? null : workFriendly === "true",
    status
  };
}

const adminIdentity = (): string => process.env.INBOX_USERNAME?.trim() || "admin";

placesAdminRouter.get("/", async (req, res) => {
  const filters: PlaceAdminFilters = {
    search: String(req.query.search ?? "").trim() || undefined,
    neighbourhood: String(req.query.neighbourhood ?? "").trim() || undefined,
    category: String(req.query.category ?? "").trim() || undefined,
    status: String(req.query.status ?? "").trim() || undefined
  };
  try {
    const [places, options] = await Promise.all([listPlacesForAdmin(filters), placeAdminFilterOptions()]);
    res.type("html").send(renderPlacesAdminList({ places, filters, options }));
  } catch (error) {
    console.error("Places admin list failed", error);
    res.status(500).send("The places overview could not be loaded.");
  }
});

placesAdminRouter.post("/:id/photos", photoUpload.array("photos", 20), requireAdminCsrf, async (req, res) => {
  const placeId = String(req.params.id);
  if (!validId(placeId)) { res.status(404).send("Place not found."); return; }
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) { res.redirect(303, `/admin/places/${placeId}?photo_error=${encodeURIComponent("Select at least one JPEG.")}#photos`); return; }
  if (!cloudinaryConfigured()) { res.redirect(303, `/admin/places/${placeId}?photo_error=${encodeURIComponent("Cloudinary is not configured in staging yet.")}#photos`); return; }
  const warnings: string[] = [];
  let uploaded = 0;
  try {
    for (const file of files) {
      if (file.buffer[0] !== 0xff || file.buffer[1] !== 0xd8 || file.buffer[2] !== 0xff) throw new Error(`${file.originalname} is not a valid JPEG file.`);
      const image = await uploadPlaceJpeg({ buffer: file.buffer, filename: file.originalname, placeId });
      await addDashboardPlaceImage(placeId, { ...image, cloudinaryPublicId: image.publicId });
      uploaded += 1;
      const ratio = image.width / image.height;
      if (Math.abs(ratio - 0.8) > 0.04) warnings.push(`${file.originalname} is ${image.width}×${image.height}, not approximately 4:5.`);
    }
    const query = new URLSearchParams({ uploaded: String(uploaded) });
    if (warnings.length) query.set("photo_warning", warnings.join(" "));
    res.redirect(303, `/admin/places/${placeId}?${query}#photos`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    res.redirect(303, `/admin/places/${placeId}?uploaded=${uploaded}&photo_error=${encodeURIComponent(message)}#photos`);
  }
});

placesAdminRouter.post("/:id/video", videoUpload.single("video"), requireAdminCsrf, async (req, res) => {
  const placeId = String(req.params.id);
  if (!validId(placeId)) { res.status(404).send("Place not found."); return; }
  if (!req.file) { res.redirect(303, `/admin/places/${placeId}?video_error=${encodeURIComponent("Select an MP4, MOV or WebM video.")}#videos`); return; }
  if (!cloudinaryConfigured()) { res.redirect(303, `/admin/places/${placeId}?video_error=${encodeURIComponent("Cloudinary is not configured in staging yet.")}#videos`); return; }
  try {
    if (!await getPlaceForAdmin(placeId)) { res.status(404).send("Place not found."); return; }
    const video = await uploadPlaceVideo({ buffer: req.file.buffer, filename: req.file.originalname, placeId });
    const { replacedPublicId } = await replaceDashboardPlaceVideo(placeId, { ...video, cloudinaryPublicId: video.publicId });
    const warnings: string[] = [];
    if (Math.abs(video.width / video.height - 9 / 16) > 0.03) {
      warnings.push(`${req.file.originalname} is ${video.width}×${video.height}, not approximately 9:16.`);
    }
    if (video.durationSeconds > 30) {
      warnings.push(`${req.file.originalname} is ${video.durationSeconds.toFixed(1)} seconds; 30 seconds is recommended.`);
    }
    const query = new URLSearchParams({ video_uploaded: "1" });
    if (replacedPublicId) query.set("video_replaced", "1");
    if (warnings.length) query.set("video_warning", warnings.join(" "));
    res.redirect(303, `/admin/places/${placeId}?${query}#videos`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video upload failed.";
    res.redirect(303, `/admin/places/${placeId}?video_error=${encodeURIComponent(message)}#videos`);
  }
});

placesAdminRouter.post("/:id/video/:videoId/remove", requireAdminCsrf, async (req, res) => {
  const placeId = String(req.params.id);
  const videoId = String(req.params.videoId);
  if (!validId(placeId) || !validId(videoId) || !await removePlaceVideoRelationship(placeId, videoId)) {
    res.status(404).send("Video not found.");
    return;
  }
  res.redirect(303, `/admin/places/${placeId}?video_removed=1#videos`);
});

placesAdminRouter.post("/:id/photos/order", requireAdminCsrf, async (req, res) => {
  const placeId = String(req.params.id);
  const imageIds = Array.isArray(req.body.image_ids) ? req.body.image_ids.map(String) : [];
  if (!validId(placeId) || imageIds.some((id: string) => !validId(id)) || !await reorderPlaceImages(placeId, imageIds)) {
    res.status(400).json({ ok: false });
    return;
  }
  res.json({ ok: true });
});

placesAdminRouter.post("/:id/photos/:imageId/cover", requireAdminCsrf, async (req, res) => {
  const id = String(req.params.id);
  const imageId = String(req.params.imageId);
  if (!validId(id) || !validId(imageId) || !await setPlaceCoverImage(id, imageId)) { res.status(404).send("Image not found."); return; }
  res.redirect(303, `/admin/places/${id}#photos`);
});

placesAdminRouter.post("/:id/photos/:imageId/remove", requireAdminCsrf, async (req, res) => {
  const id = String(req.params.id);
  const imageId = String(req.params.imageId);
  if (!validId(id) || !validId(imageId) || !await removePlaceImageRelationship(id, imageId)) { res.status(404).send("Image not found."); return; }
  res.redirect(303, `/admin/places/${id}?removed=1#photos`);
});

placesAdminRouter.post("/:id/editorial", requireAdminCsrf, async (req, res) => {
  const id = String(req.params.id);
  if (!validId(id)) { res.status(404).send("Place not found."); return; }
  try {
    const changed = await updatePlaceEditorial(id, editorialUpdateFromBody(req.body), adminIdentity());
    res.redirect(303, `/admin/places/${id}?editorial_saved=1&changed=${changed.length}#editorial`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Editorial update failed.";
    res.redirect(303, `/admin/places/${id}?edit=1&editorial_error=${encodeURIComponent(message)}#editorial`);
  }
});

placesAdminRouter.post("/:id/editorial/unlock", requireAdminCsrf, async (req, res) => {
  const id = String(req.params.id);
  const field = String(req.body.field ?? "") as EditorialEditableField;
  if (!validId(id) || !EDITORIAL_EDITABLE_FIELDS.includes(field)) { res.status(400).send("Invalid field."); return; }
  await unlockPlaceEditorialField(id, field, adminIdentity());
  res.redirect(303, `/admin/places/${id}?unlocked=${encodeURIComponent(field)}#editorial`);
});

placesAdminRouter.post("/:id/archive", requireAdminCsrf, async (req, res) => {
  const id = String(req.params.id);
  if (!validId(id) || !await archivePlace(id, adminIdentity())) { res.status(404).send("Place not found or already archived."); return; }
  res.redirect(303, `/admin/places/${id}?archived=1#editorial`);
});

placesAdminRouter.post("/:id/restore", requireAdminCsrf, async (req, res) => {
  const id = String(req.params.id);
  if (!validId(id) || !await restorePlace(id, adminIdentity())) { res.status(404).send("Place not found or not archived."); return; }
  res.redirect(303, `/admin/places/${id}?restored=1#editorial`);
});

placesAdminRouter.get("/:id", async (req, res) => {
  const placeId = String(req.params.id);
  if (!validId(placeId)) {
    res.status(404).send("Place not found.");
    return;
  }
  try {
    const place = await getPlaceForAdmin(placeId);
    if (!place) { res.status(404).send("Place not found."); return; }
    res.type("html").send(renderPlaceAdminDetail({ place, csrfToken: adminCsrfToken(), cloudinaryReady: cloudinaryConfigured(), edit: req.query.edit === "1", notice: {
      uploaded: Number(req.query.uploaded ?? 0), removed: req.query.removed === "1", warning: String(req.query.photo_warning ?? "").trim() || undefined, error: String(req.query.photo_error ?? "").trim() || undefined,
      videoUploaded: req.query.video_uploaded === "1", videoReplaced: req.query.video_replaced === "1", videoRemoved: req.query.video_removed === "1",
      videoWarning: String(req.query.video_warning ?? "").trim() || undefined, videoError: String(req.query.video_error ?? "").trim() || undefined,
      editorialSaved: req.query.editorial_saved === "1", editorialChanged: Number(req.query.changed ?? 0),
      editorialError: String(req.query.editorial_error ?? "").trim() || undefined,
      unlocked: String(req.query.unlocked ?? "").trim() || undefined,
      archived: req.query.archived === "1", restored: req.query.restored === "1"
    } }));
  } catch (error) {
    console.error("Places admin detail failed", error);
    res.status(500).send("The place could not be loaded.");
  }
});
