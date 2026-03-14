import { Hono } from "hono";
import type { Env } from "../types";

const REPO = "tCoOpy/taurikit";

export const cliRoutes = new Hono<Env>();

cliRoutes.get("/latest", async (c) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return c.json({ error: "Server misconfigured" }, 500);
  }

  const resp = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "crabyard-api",
      },
    }
  );

  if (!resp.ok) {
    return c.json({ error: "Failed to fetch release info" }, 502);
  }

  const data = (await resp.json()) as { tag_name: string };
  return c.json({ version: data.tag_name });
});

cliRoutes.get("/download/:target", async (c) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return c.json({ error: "Server misconfigured" }, 500);
  }

  const target = c.req.param("target");
  const version =
    c.req.query("version") || (await fetchLatestVersion(token));

  if (!version) {
    return c.json({ error: "Could not determine version" }, 502);
  }

  const ext = target.includes("windows") ? "zip" : "tar.gz";
  const assetName = `crabyard-${target}.${ext}`;

  const releaseResp = await fetch(
    `https://api.github.com/repos/${REPO}/releases/tags/${version}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "crabyard-api",
      },
    }
  );

  if (!releaseResp.ok) {
    return c.json({ error: `Release ${version} not found` }, 404);
  }

  const release = (await releaseResp.json()) as {
    assets: { name: string; url: string }[];
  };

  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    return c.json({ error: `Asset ${assetName} not found` }, 404);
  }

  const downloadResp = await fetch(asset.url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/octet-stream",
      "User-Agent": "crabyard-api",
    },
    redirect: "follow",
  });

  if (!downloadResp.ok || !downloadResp.body) {
    return c.json({ error: "Failed to download asset" }, 502);
  }

  return new Response(downloadResp.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${assetName}"`,
    },
  });
});

async function fetchLatestVersion(token: string): Promise<string | null> {
  const resp = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "crabyard-api",
      },
    }
  );
  if (!resp.ok) return null;
  const data = (await resp.json()) as { tag_name: string };
  return data.tag_name;
}
