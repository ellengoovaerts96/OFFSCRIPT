import { Router } from "express";
import multer from "multer";
import { addDashboardPlaceImage, getPlaceForAdmin, listPlacesForAdmin, placeAdminFilterOptions, removePlaceImageRelationship, reorderPlaceImages, setPlaceCoverImage, type PlaceAdminFilters } from "../data/placesAdminRepository.js";
import { adminCsrfToken, requireAdminBasicAuth, requireAdminCsrf } from "../middleware/adminBasicAuth.js";
import { renderPlaceAdminDetail, renderPlacesAdminList } from "../logic/placesAdminHtml.js";
import { cloudinaryConfigured, uploadPlaceJpeg } from "../integrations/cloudinary.js";

export const placesAdminRouter = Router();
placesAdminRouter.use(requireAdminBasicAuth);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 20, fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    if (file.mimetype === "image/jpeg") done(null, true);
    else done(new Error(`${file.originalname} is not a JPEG.`));
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

placesAdminRouter.post("/:id/photos", upload.array("photos", 20), requireAdminCsrf, async (req, res) => {
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
      uploaded: Number(req.query.uploaded ?? 0), removed: req.query.removed === "1", warning: String(req.query.photo_warning ?? "").trim() || undefined, error: String(req.query.photo_error ?? "").trim() || undefined
    } }));
  } catch (error) {
    console.error("Places admin detail failed", error);
    res.status(500).send("The place could not be loaded.");
  }
});
