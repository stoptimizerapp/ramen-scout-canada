import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isCitySearchReady,
  isFacetSearchReady,
  isProvinceSearchReady,
  isRestaurantSearchReady,
} from "../lib/search-readiness.js";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(siteRoot, "dist", "client");
const outputRoot = path.join(siteRoot, "pages-out");
const canonicalOrigin = "https://ramenscout.ca";
const staticIndexingEnabled = process.env.NEXT_PUBLIC_ALLOW_STATIC_INDEXING === "true";
const allStaticContentRoutes = new Set([
  "/",
  "/locations",
  "/about",
  "/methodology",
  "/editorial-standards",
  "/accessibility",
  "/contact",
  "/corrections",
  "/privacy",
  "/terms",
  "/guides/choosing-ramen",
]);

const [restaurants, summary] = await Promise.all([
  fs.readFile(path.join(siteRoot, "data", "restaurants.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(siteRoot, "data", "directory-summary.json"), "utf8").then(JSON.parse),
]);

const routes = new Set([
  "/",
  "/about",
  "/accessibility",
  "/contact",
  "/corrections",
  "/editorial-standards",
  "/locations",
  "/methodology",
  "/privacy",
  "/search",
  "/terms",
  "/guides/choosing-ramen",
  ...["tonkotsu", "shoyu", "miso", "tsukemen"].map((style) => `/styles/${style}`),
  ...["late-night", "reservations", "vegan", "house-made-noodles"].map((feature) => `/features/${feature}`),
  ...summary.provinces.map((province) => `/locations/${province.slug}`),
  ...summary.provinces.flatMap((province) => province.cities.map((city) => `/locations/${province.slug}/${city.slug}`)),
  ...restaurants.map((restaurant) => restaurant.canonicalPath),
]);

if (routes.size !== 1 + 11 + 4 + 4 + summary.provinces.length + summary.cityCount + restaurants.length) {
  throw new Error("Static route inventory contains a duplicate or unexpected count");
}

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.cp(clientRoot, outputRoot, { recursive: true });

const exportedIndexNowKeys = (await fs.readdir(outputRoot)).filter((name) => /^[A-Za-z0-9-]{8,128}\.txt$/.test(name));
const validExportedIndexNowKeys = [];
for (const name of exportedIndexNowKeys) {
  const key = name.slice(0, -4);
  if ((await fs.readFile(path.join(outputRoot, name), "utf8")).trim() === key) validExportedIndexNowKeys.push(name);
}
if (validExportedIndexNowKeys.length !== 1) throw new Error(`Expected exactly one exported IndexNow key, found ${validExportedIndexNowKeys.length}`);

const worker = (await import(new URL("../dist/server/index.js", import.meta.url))).default;
const executionContext = { waitUntil() {}, passThroughOnException() {} };
const environment = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

function routeFile(route) {
  return route === "/" ? path.join(outputRoot, "index.html") : path.join(outputRoot, route.slice(1), "index.html");
}

async function render(route, expectedStatus = 200) {
  const response = await worker.fetch(
    new Request(`${canonicalOrigin}${route}`, { headers: { accept: "text/html" } }),
    environment,
    executionContext,
  );
  if (response.status !== expectedStatus) throw new Error(`${route} returned ${response.status}; expected ${expectedStatus}`);
  return response;
}

const routeList = [...routes].sort();
const styleRoutes = ["tonkotsu", "shoyu", "miso", "tsukemen"].flatMap((style) => {
  const entries = restaurants.filter((restaurant) => restaurant.taxonomy[style] === "yes");
  return isFacetSearchReady(entries) ? [`/styles/${style}`] : [];
});
const featureMatchers = {
  "late-night": (restaurant) => restaurant.hours.lateNightStatus === "yes",
  reservations: (restaurant) => ["accepted", "required"].includes(restaurant.reservations.status),
  vegan: (restaurant) => ["one_complete_bowl", "multiple_complete_bowls"].includes(restaurant.vegan.status),
  "house-made-noodles": (restaurant) => restaurant.noodles.status === "made_on_site",
};
const featureRoutes = Object.entries(featureMatchers).flatMap(([feature, matches]) => {
  const entries = restaurants.filter(matches);
  return isFacetSearchReady(entries) ? [`/features/${feature}`] : [];
});
const provinceRoutes = summary.provinces.flatMap((province) => {
  const entries = restaurants.filter((restaurant) => restaurant.provinceSlug === province.slug);
  return isProvinceSearchReady(entries) ? [`/locations/${province.slug}`] : [];
});
const cityRoutes = summary.provinces.flatMap((province) => province.cities.flatMap((city) => {
  const entries = restaurants.filter((restaurant) => restaurant.provinceSlug === province.slug && restaurant.citySlug === city.slug);
  return isCitySearchReady(entries) ? [`/locations/${province.slug}/${city.slug}`] : [];
}));
const indexableRoutes = new Set([
  ...allStaticContentRoutes,
  ...provinceRoutes,
  ...cityRoutes,
  ...styleRoutes,
  ...featureRoutes,
  ...restaurants.filter((restaurant) => isRestaurantSearchReady(restaurant)).map((restaurant) => restaurant.canonicalPath),
]);
let nextRoute = 0;
const htmlByRoute = new Map();
const renderWorkers = Array.from({ length: Math.min(12, routeList.length) }, async () => {
  while (nextRoute < routeList.length) {
    const route = routeList[nextRoute++];
    const response = await render(route);
    const html = await response.text();
    if (!/^<!DOCTYPE html>/i.test(html)) throw new Error(`${route} did not return a complete HTML document`);
    const expectedRobots = staticIndexingEnabled && indexableRoutes.has(route) ? "index, follow" : "noindex, follow";
    if (!html.includes(`name="robots" content="${expectedRobots}"`)) throw new Error(`${route} has an unexpected robots directive; expected ${expectedRobots}`);
    if (!html.includes(`href="${canonicalOrigin}${route === "/" ? "" : route}"`)) throw new Error(`${route} has an unexpected canonical URL`);
    const destination = routeFile(route);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, html);
    htmlByRoute.set(route, html);
  }
});
await Promise.all(renderWorkers);

for (const [route, html] of htmlByRoute) {
  for (const match of html.matchAll(/(?:href|src|action)="(\/[^"]*)"/g)) {
    const target = new URL(match[1], canonicalOrigin);
    const pathname = decodeURI(target.pathname).replace(/\/$/, "") || "/";
    if (routes.has(pathname)) continue;
    const assetPath = path.join(outputRoot, pathname.slice(1));
    if (await fs.stat(assetPath).then((value) => value.isFile()).catch(() => false)) continue;
    if (["/manifest.webmanifest", "/robots.txt", "/sitemap.xml"].includes(pathname)) continue;
    throw new Error(`${route} links to missing internal target ${pathname}`);
  }
}

for (const route of ["/manifest.webmanifest", "/robots.txt", "/sitemap.xml"]) {
  const response = await worker.fetch(new Request(`${canonicalOrigin}${route}`), environment, executionContext);
  if (!response.ok) throw new Error(`${route} returned ${response.status}`);
  await fs.writeFile(path.join(outputRoot, route.slice(1)), await response.text());
}

const notFound = await render("/__ramen_scout_missing_page__", 404);
await fs.writeFile(path.join(outputRoot, "404.html"), await notFound.text());
await fs.writeFile(path.join(outputRoot, ".nojekyll"), "");
await fs.writeFile(path.join(outputRoot, "CNAME"), "ramenscout.ca\n");

const robots = await fs.readFile(path.join(outputRoot, "robots.txt"), "utf8");
const sitemapXml = await fs.readFile(path.join(outputRoot, "sitemap.xml"), "utf8");
if (staticIndexingEnabled) {
  if (!/^Allow:\s*\/\s*$/im.test(robots)) throw new Error("robots.txt must allow crawling for Google to see page-level noindex directives");
  if (/^Disallow:\s*\/\s*$/im.test(robots)) throw new Error("robots.txt must not block the entire staged site");
  if (!robots.includes(`${canonicalOrigin}/sitemap.xml`)) throw new Error("robots.txt must advertise the canonical sitemap");
  const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
  const expectedUrls = [...indexableRoutes].map((route) => `${canonicalOrigin}${route}`).sort();
  if (JSON.stringify(sitemapUrls) !== JSON.stringify(expectedUrls)) throw new Error(`sitemap.xml does not match the indexable canonical inventory: expected ${expectedUrls.length} URLs, found ${sitemapUrls.length}`);
  if (![...allStaticContentRoutes].every((route) => indexableRoutes.has(route))) throw new Error("Every canonical static content page must be included in the searchable inventory");
} else {
  if (!/^Disallow:\s*\/\s*$/im.test(robots)) throw new Error("robots.txt must remain fail-closed when staged indexing is disabled");
  if (/<url>/i.test(sitemapXml)) throw new Error("sitemap.xml must remain empty when staged indexing is disabled");
}

console.log(`Exported ${routeList.length} static HTML routes for GitHub Pages.`);
