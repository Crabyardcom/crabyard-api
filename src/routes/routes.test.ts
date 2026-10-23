import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cliRoutes } from "./cli";
import { licenseRoutes } from "./license";
import { templateRoutes } from "./template";
import type { Env } from "../types";

const originalFetch = globalThis.fetch;
const originalAdminKey = process.env.ADMIN_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalAdminKey === undefined) delete process.env.ADMIN_KEY;
  else process.env.ADMIN_KEY = originalAdminKey;
});

const app = new Hono<Env>();
app.onError((error, c) => error instanceof HTTPException
  ? error.getResponse() : c.json({ error: "Request failed" }, 500));
app.route("/cli", cliRoutes);
app.route("/license", licenseRoutes);
app.route("/template", templateRoutes);

describe("untrusted request validation", () => {
  test.each(["null", "{", '{"key":123}', '{"key":""}'])("invalid license JSON: %s", async (body) => {
    const response = await app.request("/license/validate", { method: "POST", body });
    expect(response.status).toBe(400);
  });
  test("oversized license payloads are rejected", async () => {
    const response = await app.request("/license/validate", {
      method: "POST", body: JSON.stringify({ key: "a".repeat(5000) }),
    });
    expect(response.status).toBe(413);
  });
  test.each(["Basic license", "license", "Bearer one two"])("rejects malformed authorization: %s", async (authorization) => {
    const response = await app.request("/template/0.1.0", { headers: { Authorization: authorization } });
    expect(response.status).toBe(401);
  });
  test("rejects unsafe template versions before database access", async () => {
    const response = await app.request("/template/bad-version", { headers: { Authorization: "Bearer key" } });
    expect(response.status).toBe(400);
  });
  test("upload fails closed without an admin secret", async () => {
    delete process.env.ADMIN_KEY;
    const response = await app.request("/template/upload?version=0.1.0", { method: "POST" });
    expect(response.status).toBe(401);
  });
  test("upload rejects files without gzip magic", async () => {
    process.env.ADMIN_KEY = "admin-test-key";
    const response = await app.request("/template/upload?version=0.1.0", {
      method: "POST", headers: { "X-Admin-Key": "admin-test-key" }, body: "not an archive",
    });
    expect(response.status).toBe(400);
  });
  test("rejects unsupported release targets before contacting GitHub", async () => {
    const response = await app.request("/cli/download/arbitrary-target");
    expect(response.status).toBe(400);
  });
  test("rejects release paths disguised as versions", async () => {
    const response = await app.request("/cli/download/x86_64-pc-windows-msvc?version=../assets/1");
    expect(response.status).toBe(400);
  });
});

describe("CLI distribution", () => {
  test("queries the standalone organization repository", async () => {
    let requested = "";
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested = String(input);
      return Response.json({ tag_name: "v0.2.0" });
    }) as unknown as typeof fetch;
    const response = await app.request("/cli/latest");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: "v0.2.0" });
    expect(requested).toBe("https://api.github.com/repos/Crabyardcom/crabyard-cli/releases/latest");
  });
  test("never forwards credentials to release assets outside GitHub", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      return Response.json({ assets: [{ name: "crabyard-x86_64-pc-windows-msvc.zip", url: "https://example.com/steal" }] });
    }) as unknown as typeof fetch;
    const response = await app.request("/cli/download/x86_64-pc-windows-msvc?version=v0.2.0");
    expect(response.status).toBe(502);
    expect(requests).toBe(1);
  });
  test("streams the matching checksum sidecar", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      if (requests === 1) return Response.json({ assets: [{
        name: "crabyard-x86_64-pc-windows-msvc.zip.sha256",
        url: "https://api.github.com/repos/Crabyardcom/crabyard-cli/releases/assets/123",
      }] });
      return new Response("abc123  crabyard-x86_64-pc-windows-msvc.zip\n");
    }) as unknown as typeof fetch;
    const response = await app.request("/cli/download/x86_64-pc-windows-msvc?version=v0.2.0&checksum=1");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("abc123");
  });
});
