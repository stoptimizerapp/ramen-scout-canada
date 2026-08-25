import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(siteRoot, "public");
const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL || "https://ramenscout.ca").replace(/\/$/, "");
const siteHost = new URL(siteOrigin).hostname;
const endpoint = "https://api.indexnow.org/indexnow";

const keyFiles = (await fs.readdir(publicRoot)).filter((name) => /^[A-Za-z0-9-]{8,128}\.txt$/.test(name));
const validKeys = [];
for (const name of keyFiles) {
  const key = name.slice(0, -4);
  const content = (await fs.readFile(path.join(publicRoot, name), "utf8")).trim();
  if (content === key) validKeys.push({ key, name });
}
if (validKeys.length !== 1) throw new Error(`Expected exactly one valid IndexNow key file, found ${validKeys.length}`);

const [{ key, name }] = validKeys;
const keyLocation = `${siteOrigin}/${name}`;
const sitemapUrl = `${siteOrigin}/sitemap.xml`;

async function waitForPublicKey() {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(`${keyLocation}?deployment=${Date.now()}`, { cache: "no-store" }).catch(() => null);
    if (response?.ok && (await response.text()).trim() === key) return;
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`The IndexNow ownership key is not publicly available at ${keyLocation}`);
}

await waitForPublicKey();
const sitemapResponse = await fetch(`${sitemapUrl}?indexnow=${Date.now()}`, { cache: "no-store" });
if (!sitemapResponse.ok) throw new Error(`Unable to download sitemap: HTTP ${sitemapResponse.status}`);
const sitemap = await sitemapResponse.text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&"));
if (!urlList.length || urlList.length > 10_000) throw new Error(`Invalid IndexNow URL count: ${urlList.length}`);
if (urlList.some((url) => new URL(url).hostname !== siteHost)) throw new Error("The sitemap contains a URL outside the verified IndexNow host");

async function submitUrls() {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: siteHost, key, keyLocation, urlList }),
    });
    if ([200, 202].includes(response.status)) return response.status;

    const body = await response.text();
    const verificationPending = response.status === 403 && body.includes("SiteVerificationNotCompleted");
    if (!verificationPending || attempt === 6) {
      throw new Error(`IndexNow rejected the submission: HTTP ${response.status} ${body}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("IndexNow submission did not complete");
}

const status = await submitUrls();
console.log(`IndexNow accepted ${urlList.length} URLs with HTTP ${status}.`);
