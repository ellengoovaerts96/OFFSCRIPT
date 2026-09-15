import { Router } from "express";
import { requireAdminBasicAuth } from "../middleware/adminBasicAuth.js";
import { dashboardConfig } from "../logic/dashboardConfig.js";
import { renderDashboard, renderStagingTest } from "../logic/dashboardHtml.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAdminBasicAuth);
dashboardRouter.get("/", (_req, res) => {
  res.type("html").send(renderDashboard(dashboardConfig()));
});
dashboardRouter.get("/test", (_req, res) => {
  res.type("html").send(renderStagingTest());
});
