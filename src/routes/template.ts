import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { timingSafeEqual } from "node:crypto";
import type { Env, License } from "../types";

export const templateRoutes = new Hono<Env>();
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

templateRoutes.use("/upload", async (c, next) => {
  const secret = c.req.header("X-Admin-Key");
  const expected = process.env.ADMIN_KEY;
  if (!secret || !expected || Buffer.byteLength(secret) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

templateRoutes.post("/upload", bodyLimit({ maxSize: 32 * 1024 * 1024 }), async (c) => {
  const version = c.req.query("version");
  if (!version || !VERSION.test(version)) {
    return c.json({ error: "Expected a semantic template version" }, 400);
  }

  const body = await c.req.arrayBuffer();
  const data = Buffer.from(body);
  if (data.length < 2 || data[0] !== 0x1f || data[1] !== 0x8b) {
    return c.json({ error: "Expected a gzip archive" }, 400);
  }

  const db = c.get("db");

  await db`
    INSERT INTO templates (version, data)
    VALUES (${version}, ${data})
    ON CONFLICT (version) DO UPDATE SET data = ${data}, uploaded_at = NOW()
  `;

  return c.json({ ok: true, version, bytes: data.length });
});

templateRoutes.get("/:version", async (c) => {
  const authHeader = c.req.header("Authorization");
  const key = authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1];

  if (!key || key.length > 256) {
    return c.json({ error: "Missing license key" }, 401);
  }

  const version = c.req.param("version");
  if (!VERSION.test(version)) {
    return c.json({ error: "Invalid template version" }, 400);
  }

  const db = c.get("db");

  const [license] = await db<License[]>`
    SELECT * FROM licenses WHERE key = ${key} AND active = true
  `;

  if (!license) {
    return c.json({ error: "Invalid or inactive license" }, 403);
  }

  const [row] = await db<{ data: Buffer }[]>`
    SELECT data FROM templates WHERE version = ${version}
  `;

  if (!row) {
    return c.json({ error: `Template version ${version} not found` }, 404);
  }

  return new Response(row.data, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="crabyard-${version}.tar.gz"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
