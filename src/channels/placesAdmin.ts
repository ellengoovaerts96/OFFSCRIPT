import { Router } from "express";
import multer from "multer";
import { addDashboardPlaceImage, getPlaceForAdmin, listPlacesForAdmin, placeAdminFilterOptions, removePlaceImageRelationship, removePlaceVideoRelationship, reorderPlaceImages, replaceDashboardPlaceVideo, setPlaceCoverImage, type PlaceAdminFilters } from "../data/placesAdminRepository.js";
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

placesAdminRouter.get("/:id", async (req, res) => {
  const placeId = String(req.params.id);
  if (!validId(placeId)) {
    res.status(404).send("Place not found.");
    return;
  }
  try {
    const place = await getPlaceForAdmin(placeId);
    if (!place) { res.status(404).send("Place not found."); return; }
    res.type("html").send(renderPlaceAdminDetail({ place, csrfToken: adminCsrfToken(), cloudinaryReady: cloudinaryConfigured(), notice: {
      uploaded: Number(req.query.uploaded ?? 0), removed: req.query.removed === "1", warning: String(req.query.photo_warning ?? "").trim() || undefined, error: String(req.query.photo_error ?? "").trim() || undefined,
      videoUploaded: req.query.video_uploaded === "1", videoReplaced: req.query.video_replaced === "1", videoRemoved: req.query.video_removed === "1",
      videoWarning: String(req.query.video_warning ?? "").trim() || undefined, videoError: String(req.query.video_error ?? "").trim() || undefined
    } }));
  } catch (error) {
    console.error("Places admin detail failed", error);
    res.status(500).send("The place could not be loaded.");
  }
});
