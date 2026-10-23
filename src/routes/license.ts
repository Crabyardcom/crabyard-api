import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Env, License } from "../types";

export const licenseRoutes = new Hono<Env>();

licenseRoutes.post("/validate", bodyLimit({ maxSize: 4096 }), async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    body = null;
  }
  const key = body && typeof body === "object" && "key" in body &&
    typeof body.key === "string" ? body.key.trim() : "";

  if (!key || key.length > 256) {
    return c.json({ valid: false, message: "Missing license key" }, 400);
  }

  const db = c.get("db");

  const [license] = await db<License[]>`
    SELECT * FROM licenses WHERE key = ${key}
  `;

  if (!license) {
    return c.json({ valid: false, message: "Unknown license key" }, 401);
  }

  if (!license.active) {
    return c.json({ valid: false, message: "License deactivated" }, 403);
  }

  await db`
    UPDATE licenses SET last_used = NOW() WHERE id = ${license.id}
  `;

  c.header("Cache-Control", "no-store");
  return c.json({ valid: true, plan: license.plan });
});
