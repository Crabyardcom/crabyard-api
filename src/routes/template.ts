import { Hono } from "hono";
import type { Env, License } from "../types";

export const templateRoutes = new Hono<Env>();

templateRoutes.post("/upload", async (c) => {
  const secret = c.req.header("X-Admin-Key");
  if (!secret || secret !== process.env.ADMIN_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const version = c.req.query("version");
  if (!version) {
    return c.json({ error: "Missing ?version= parameter" }, 400);
  }

  const body = await c.req.arrayBuffer();
  const data = Buffer.from(body);

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
  const key = authHeader?.replace("Bearer ", "").trim();

  if (!key) {
    return c.json({ error: "Missing license key" }, 401);
  }

  const db = c.get("db");

  const [license] = await db<License[]>`
    SELECT * FROM licenses WHERE key = ${key} AND active = true
  `;

  if (!license) {
    return c.json({ error: "Invalid or inactive license" }, 403);
  }

  const version = c.req.param("version");

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
    },
  });
});
