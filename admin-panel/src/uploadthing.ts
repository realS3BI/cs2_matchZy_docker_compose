import crypto from "node:crypto";
import { createUploadthing, type FileRouter } from "uploadthing/express";
import { UploadThingError } from "uploadthing/server";

const COOKIE_NAME = "cs2_panel_session";

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function cookieValue(header, name) {
  const cookies = String(header || "").split(";");
  for (const cookie of cookies) {
    const [rawKey, ...rawValue] = cookie.trim().split("=");
    if (rawKey === name) return rawValue.join("=");
  }
  return "";
}

function isValidSession(cookie, secret) {
  if (!cookie || !cookie.includes(".")) return false;
  const [payload, signature] = cookie.split(".");
  const expected = sign(payload, secret);
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.authenticated === true && Date.now() - Number(data.createdAt || 0) < 12 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function requestCookie(req) {
  if (typeof req?.headers?.get === "function") return req.headers.get("cookie");
  return req?.headers?.cookie;
}

export function uploadRouter(config) {
  const f = createUploadthing();

  return {
    lineupImageUploader: f(
      {
        image: {
          maxFileSize: "4MB",
          maxFileCount: 10
        }
      },
      { awaitServerData: true }
    )
      .middleware(async ({ req }) => {
        const session = cookieValue(requestCookie(req), COOKIE_NAME);
        if (!isValidSession(session, config.sessionSecret)) {
          throw new UploadThingError("Unauthorized");
        }
        return {};
      })
      .onUploadComplete(({ file }) => ({
        key: file.key,
        url: file.url,
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString()
      }))
  } satisfies FileRouter;
}

export type UploadRouter = ReturnType<typeof uploadRouter>;
