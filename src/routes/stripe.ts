import { Hono } from "hono";
import Stripe from "stripe";
import { Resend } from "resend";
import type { Env } from "../types";

export const stripeRoutes = new Hono<Env>();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key);
}

stripeRoutes.use("/*", async (c, next) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "Stripe not configured" }, 503);
  }
  await next();
});

stripeRoutes.post("/checkout", async (c) => {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: "https://crabyard.dev/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://crabyard.dev/#pricing",
    payment_intent_data: {
      metadata: { product: "crabyard" },
    },
  });

  return c.json({ url: session.url });
});

stripeRoutes.get("/session/:sessionId", async (c) => {
  const stripe = getStripe();
  const sessionId = c.req.param("sessionId");

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    return c.json({ error: "Payment not completed" }, 402);
  }

  const paymentId = session.payment_intent?.toString();
  if (!paymentId) {
    return c.json({ error: "No payment found" }, 404);
  }

  const db = c.get("db");

  const [license] = await db<{ key: string; plan: string; created_at: string }[]>`
    SELECT key, plan, created_at FROM licenses WHERE stripe_payment_id = ${paymentId}
  `;

  if (!license) {
    return c.json({ error: "License not yet provisioned" }, 404);
  }

  return c.json({ key: license.key, plan: license.plan });
});

stripeRoutes.post("/webhook", async (c) => {
  const stripe = getStripe();
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: "Missing signature" }, 400);
  }

  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_details?.email;

    if (!email) {
      return c.json({ error: "No email in session" }, 400);
    }

    const key = generateLicenseKey();
    const db = c.get("db");

    await db`
      INSERT INTO licenses (id, email, key, plan, stripe_customer_id, stripe_payment_id)
      VALUES (
        ${crypto.randomUUID()},
        ${email},
        ${key},
        'standard',
        ${session.customer?.toString() ?? null},
        ${session.payment_intent?.toString() ?? null}
      )
    `;

    const resend = new Resend(process.env.RESEND_API_KEY!);
    await resend.emails.send({
      from: "Crabyard <noreply@crabyard.dev>",
      to: email,
      subject: "Your Crabyard License Key",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; margin-bottom: 16px;">Welcome to Crabyard!</h1>
          <p style="color: #71717a; margin-bottom: 24px;">Your license key is ready. Use it with the CLI to generate projects.</p>
          <div style="background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #a1a1aa; font-size: 12px; margin: 0 0 8px;">LICENSE KEY</p>
            <code style="color: #fb923c; font-size: 14px; word-break: break-all;">${key}</code>
          </div>
          <div style="background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px;">
            <p style="color: #a1a1aa; font-size: 12px; margin: 0 0 12px;">QUICK START</p>
            <code style="display: block; color: #d4d4d8; font-size: 13px; line-height: 2;">$ curl -fsSL https://crabyard.dev/install.sh | sh<br>$ export CRABYARD_LICENSE_KEY=${key}<br>$ crabyard new "My App"</code>
          </div>
          <p style="color: #52525b; font-size: 12px; margin-top: 24px;">If you have questions, reply to this email or contact support@crabyard.dev</p>
        </div>
      `,
    });
  }

  return c.json({ received: true });
});

function generateLicenseKey(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return `TK-${chunk(hex, 8).join("-").toUpperCase()}`;
}

function chunk(str: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}
