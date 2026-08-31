import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function secureEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

export function requireAdminBasicAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedUsername = process.env.INBOX_USERNAME;
  const expectedPassword = process.env.INBOX_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    res.status(503).send("Admin access is not configured.");
    return;
  }

  const authorization = req.headers.authorization;
  const credentials = authorization?.startsWith("Basic ")
    ? Buffer.from(authorization.slice(6), "base64").toString("utf8")
    : "";
  const separatorIndex = credentials.indexOf(":");
  const username = separatorIndex >= 0 ? credentials.slice(0, separatorIndex) : "";
  const password = separatorIndex >= 0 ? credentials.slice(separatorIndex + 1) : "";

  if (!secureEqual(username, expectedUsername) || !secureEqual(password, expectedPassword)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="TUUTI Admin"');
    res.status(401).send("Authentication required.");
    return;
  }

  next();
}

export function adminCsrfToken(): string {
  const password = process.env.INBOX_PASSWORD;
  if (!password) return "";
  return createHmac("sha256", password).update("tuuti-sources-admin").digest("hex");
}

export function requireAdminCsrf(req: Request, res: Response, next: NextFunction): void {
  const expected = adminCsrfToken();
  const received = String(req.body?._csrf ?? "");
  if (!expected || !secureEqual(received, expected)) {
    res.status(403).send("Invalid admin form token.");
    return;
  }
  next();
}
