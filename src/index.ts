import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import postgres from "postgres";
import type { Env } from "./types";
import { licenseRoutes } from "./routes/license";
import { templateRoutes } from "./routes/template";
import { stripeRoutes } from "./routes/stripe";
import { cliRoutes } from "./routes/cli";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not configured");
const sql = postgres(process.env.DATABASE_URL);

const app = new Hono<Env>();
app.use("*", secureHeaders());
app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  console.error("Request failed:", error.message);
  return c.json({ error: "Request failed" }, 500);
});

app.use("*", async (c, next) => {
  c.set("db", sql);
  await next();
});

app.use(
  "*",
  cors({
    origin: ["https://crabyard.dev"],
    allowMethods: ["GET", "POST"],
    allowHeaders: ["Content-Type", "Authorization", "X-Admin-Key"],
  })
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/license", licenseRoutes);
app.route("/template", templateRoutes);
app.route("/stripe", stripeRoutes);
app.route("/cli", cliRoutes);

const port = parseInt(process.env.PORT || "3000", 10);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`crabyard-api listening on :${info.port}`);
});
