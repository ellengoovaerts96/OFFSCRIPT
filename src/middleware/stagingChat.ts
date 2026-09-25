import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { requireAdminBasicAuth, requireAdminCsrf } from "./adminBasicAuth.js";

export const requireStaging: RequestHandler = (_req, res, next) => {
  const environments = [process.env.TUUTI_ENVIRONMENT, process.env.RAILWAY_ENVIRONMENT_NAME]
    .filter((value): value is string => value !== undefined)
    .map(value => value.trim().toLowerCase());
  if (!environments.length || environments.some(value => value !== "staging")) {
    res.sendStatus(404);
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
};

const cookieName = "tuuti_staging_chat";
const lifetime = 8 * 60 * 60 * 1000;
const signature = (payload: string) => createHmac("sha256", process.env.INBOX_PASSWORD!)
  .update("tuuti-staging-chat:" + payload).digest("hex");

const testIdentity: RequestHandler = (req, res, next) => {
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "userPhone")) {
    res.status(400).json({ error: "Client-supplied user identities are not accepted." });
    return;
  }
  const token = req.headers.cookie?.split(";").map(part => part.trim())
    .find(part => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1) ?? "";
  const match = /^([0-9a-f-]{36})\.(\d{13})\.([0-9a-f]{64})$/.exec(token);
  let id: string;
  if (match && Number(match[2]) > Date.now() && Number(match[2]) <= Date.now() + lifetime &&
      timingSafeEqual(Buffer.from(match[3]), Buffer.from(signature(`${match[1]}.${match[2]}`)))) {
    id = match[1];
  } else {
    id = randomUUID();
    const payload = `${id}.${Date.now() + lifetime}`;
    res.cookie(cookieName, `${payload}.${signature(payload)}`, {
      httpOnly: true, sameSite: "strict", secure: req.secure || Boolean(process.env.RAILWAY_ENVIRONMENT_NAME),
      path: "/", maxAge: lifetime
    });
  }
  res.locals.testUserPhone = `dashboard:test:${id}`;
  next();
};

export const stagingChatAccess = [requireStaging, requireAdminBasicAuth, requireAdminCsrf, testIdentity];
