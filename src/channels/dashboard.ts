import { Router } from "express";
import { adminCsrfToken, requireAdminBasicAuth } from "../middleware/adminBasicAuth.js";
import { requireStaging } from "../middleware/stagingChat.js";
import { dashboardConfig } from "../logic/dashboardConfig.js";
import { renderDashboard, renderStagingTest } from "../logic/dashboardHtml.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAdminBasicAuth);
dashboardRouter.get("/", (_req, res) => {
  res.type("html").send(renderDashboard(dashboardConfig()));
});
dashboardRouter.get("/test", requireStaging, (_req, res) => {
  res.type("html").send(renderStagingTest(adminCsrfToken()));
});
