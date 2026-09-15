import { Router } from "express";
import { requireAdminBasicAuth } from "../middleware/adminBasicAuth.js";
import { dashboardConfig } from "../logic/dashboardConfig.js";
import { renderDashboard } from "../logic/dashboardHtml.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAdminBasicAuth);
dashboardRouter.get("/", (_req, res) => {
  res.type("html").send(renderDashboard(dashboardConfig()));
});
