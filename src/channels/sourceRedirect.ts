import { Router } from "express";
import { handleSourceRedirect } from "../logic/sourceRedirectHandler.js";

export const sourceRedirectRouter = Router();
sourceRedirectRouter.get("/:slug", (req, res) => handleSourceRedirect(req, res));
