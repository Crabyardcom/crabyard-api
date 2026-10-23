import { afterEach, beforeEach, expect, test } from "bun:test";
import { Hono } from "hono";
import Stripe from "stripe";
import type { Sql } from "postgres";
import type { Env } from "../types";
import { stripeRoutes } from "./stripe";

const originalFetch = globalThis.fetch;
const variables = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID", "RESEND_API_KEY", "CRABYARD_EMAIL_FROM"] as const;
const originalVariables = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
const secret = "whsec_crabyard_test";
let license: { key: string; email_sent_at: string | null } | undefined;
let inserts: number;
let emails: number;
let failEmail: boolean;
const db = Object.assign(async (query: TemplateStringsArray) => {
  if (query.join("").includes("UPDATE licenses") && license) license.email_sent_at = "sent";
  return [];
}, {
  begin: async (callback: (transaction: { unsafe: (query: string, parameters?: unknown[]) => Promise<unknown[]> }) => unknown) => callback({
    unsafe: async (query: string, parameters?: unknown[]) => {
      if (query.includes("SELECT key")) return license ? [license] : [];
      if (query.includes("INSERT INTO licenses")) {
        inserts++;
        license = { key: parameters![2] as string, email_sent_at: null };
      }
      return [];
    },
  }),
}) as unknown as Sql;
const app = new Hono<Env>();
app.use("*", async (c, next) => { c.set("db", db); await next(); });
app.route("/stripe", stripeRoutes);

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_crabyard";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.RESEND_API_KEY = "re_crabyard";
  process.env.CRABYARD_EMAIL_FROM = "Crabyard Test <sender@example.com>";
  license = undefined;
  inserts = 0;
  emails = 0;
  failEmail = false;
  globalThis.fetch = (async () => {
    emails++;
    return failEmail
      ? Response.json({ name: "application_error", message: "Unavailable" }, { status: 503 })
      : Response.json({ id: "email-1" });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of variables) {
    if (originalVariables[key] === undefined) delete process.env[key];
    else process.env[key] = originalVariables[key];
  }
});

async function deliver(paymentStatus = "paid", type = "checkout.session.completed") {
  const payload = JSON.stringify({
    id: "evt_crabyard", type,
    data: { object: {
      id: "cs_test_crabyard", mode: "payment", payment_status: paymentStatus,
      customer_details: { email: "buyer@example.com" }, payment_intent: "pi_crabyard",
      customer: "cus_crabyard", metadata: { product: "crabyard" },
    } },
  });
  const stripe = new Stripe("sk_test_crabyard");
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
  return app.request("/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload });
}

test("unpaid completed sessions never receive a license", async () => {
  expect((await deliver("unpaid")).status).toBe(200);
  expect(inserts).toBe(0);
  expect(emails).toBe(0);
});
test("repeated paid events reuse the license and do not resend delivered email", async () => {
  expect((await deliver()).status).toBe(200);
  const key = license!.key;
  expect((await deliver()).status).toBe(200);
  expect(license!.key).toBe(key);
  expect(key).toMatch(/^CRAB-/);
  expect(inserts).toBe(1);
  expect(emails).toBe(1);
});
test("failed email delivery is retried using the same license", async () => {
  failEmail = true;
  expect((await deliver()).status).toBe(502);
  const key = license!.key;
  failEmail = false;
  expect((await deliver()).status).toBe(200);
  expect(license!.key).toBe(key);
  expect(inserts).toBe(1);
  expect(emails).toBe(2);
});
test("delayed successful payments are fulfilled", async () => {
  expect((await deliver("paid", "checkout.session.async_payment_succeeded")).status).toBe(200);
  expect(inserts).toBe(1);
});
test("unsigned events cannot provision a license", async () => {
  const response = await app.request("/stripe/webhook", { method: "POST", body: "{}" });
  expect(response.status).toBe(400);
  expect(inserts).toBe(0);
});

test("paid checkout and fulfillment require an explicitly configured email sender", async () => {
  delete process.env.CRABYARD_EMAIL_FROM;
  process.env.STRIPE_PRICE_ID = "price_crabyard";
  expect((await app.request("/stripe/checkout", { method: "POST" })).status).toBe(503);
  expect((await deliver()).status).toBe(503);
  expect(inserts).toBe(0);
  expect(emails).toBe(0);
});

test("checkout returns to the deployed site without exposing a session ID", async () => {
  process.env.STRIPE_PRICE_ID = "price_crabyard";
  let parameters = new URLSearchParams();
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    parameters = new URLSearchParams(String(init?.body));
    return Response.json({ url: "https://checkout.stripe.com/test" });
  }) as unknown as typeof fetch;
  const response = await app.request("/stripe/checkout", { method: "POST" });
  expect(response.status).toBe(200);
  expect(parameters.get("success_url")).toBe("https://crabyard-web-production.up.railway.app/success");
  expect(parameters.get("cancel_url")).toBe("https://crabyard-web-production.up.railway.app/#get-started");
});
