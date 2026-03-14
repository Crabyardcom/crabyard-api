import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import postgres from "postgres";
import type { Env } from "./types";
import { licenseRoutes } from "./routes/license";
import { templateRoutes } from "./routes/template";
import { stripeRoutes } from "./routes/stripe";
import { cliRoutes } from "./routes/cli";

const sql = postgres(process.env.DATABASE_URL!);

const app = new Hono<Env>();

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
