import { Router } from "express";

export const webchatRouter = Router();

webchatRouter.post("/", async (req, res) => {
  const message = String(req.body.message ?? "").trim();

  res.json({
    message: message ? "OFFSCRIPT is warming up." : "Send a message to start."
  });
});
