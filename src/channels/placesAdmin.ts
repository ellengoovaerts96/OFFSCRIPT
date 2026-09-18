import { Router } from "express";
import { getPlaceForAdmin, listPlacesForAdmin, placeAdminFilterOptions, type PlaceAdminFilters } from "../data/placesAdminRepository.js";
import { requireAdminBasicAuth } from "../middleware/adminBasicAuth.js";
import { renderPlaceAdminDetail, renderPlacesAdminList } from "../logic/placesAdminHtml.js";

export const placesAdminRouter = Router();
placesAdminRouter.use(requireAdminBasicAuth);

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

placesAdminRouter.get("/:id", async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
    res.status(404).send("Place not found.");
    return;
  }
  try {
    const place = await getPlaceForAdmin(req.params.id);
    if (!place) { res.status(404).send("Place not found."); return; }
    res.type("html").send(renderPlaceAdminDetail(place));
  } catch (error) {
    console.error("Places admin detail failed", error);
    res.status(500).send("The place could not be loaded.");
  }
});
