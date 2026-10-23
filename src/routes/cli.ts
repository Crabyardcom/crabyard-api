import { Hono } from "hono";
import type { Env } from "../types";

const REPO = "Crabyardcom/crabyard-cli";
const TARGETS = new Set([
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
]);
const VERSION = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const cliRoutes = new Hono<Env>();

function githubHeaders(download = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: download ? "application/octet-stream" : "application/vnd.github+json",
    "User-Agent": "crabyard-api",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchRelease(path: string) {
  return fetch(`https://api.github.com/repos/${REPO}/releases/${path}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
}

cliRoutes.get("/latest", async (c) => {
  const response = await fetchRelease("latest");
  if (!response.ok) {
    return c.json({ error: "Failed to fetch release info" }, 502);
  }
  const data = (await response.json()) as { tag_name: string };
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ version: data.tag_name });
});

cliRoutes.get("/download/:target", async (c) => {
  const target = c.req.param("target");
  if (!TARGETS.has(target)) {
    return c.json({ error: "Unsupported release target" }, 400);
  }
  const version = c.req.query("version");
  if (version !== undefined && !VERSION.test(version)) {
    return c.json({ error: "Invalid release version" }, 400);
  }
  const checksum = c.req.query("checksum");
  if (checksum !== undefined && checksum !== "1") {
    return c.json({ error: "Invalid checksum parameter" }, 400);
  }

  const releaseResponse = await fetchRelease(
    version ? `tags/${encodeURIComponent(version)}` : "latest"
  );
  if (!releaseResponse.ok) {
    return c.json(
      { error: "Release not available" },
      releaseResponse.status === 404 ? 404 : 502
    );
  }
  const extension = target.includes("windows") ? "zip" : "tar.gz";
  const assetName = `crabyard-${target}.${extension}${checksum ? ".sha256" : ""}`;
  const release = (await releaseResponse.json()) as {
    assets: { name: string; url: string }[];
  };
  const asset = release.assets.find((entry) => entry.name === assetName);
  if (!asset) {
    return c.json({ error: `Asset ${assetName} not found` }, 404);
  }

  const assetUrl = new URL(asset.url);
  if (
    assetUrl.origin !== "https://api.github.com" ||
    !assetUrl.pathname.toLowerCase().startsWith(`/repos/${REPO.toLowerCase()}/releases/assets/`)
  ) {
    return c.json({ error: "Invalid release asset URL" }, 502);
  }
  const download = await fetch(assetUrl, {
    headers: githubHeaders(true),
    signal: AbortSignal.timeout(120_000),
    redirect: "follow",
  });
  if (!download.ok || !download.body) {
    return c.json({ error: "Failed to download asset" }, 502);
  }
  return new Response(download.body, {
    headers: {
      "Content-Type": checksum ? "text/plain; charset=utf-8" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${assetName}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
