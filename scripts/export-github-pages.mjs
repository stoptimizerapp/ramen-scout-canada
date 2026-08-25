import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(siteRoot, "dist", "client");
const outputRoot = path.join(siteRoot, "pages-out");
const canonicalOrigin = "https://ramenscout.ca";

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
  ...["tonkotsu", "shoyu", "miso", "tsukemen"].map((style) => `/styles/${style}`),
  ...["late-night", "reservations", "vegan", "house-made-noodles"].map((feature) => `/features/${feature}`),
  ...summary.provinces.map((province) => `/locations/${province.slug}`),
  ...summary.provinces.flatMap((province) => province.cities.map((city) => `/locations/${province.slug}/${city.slug}`)),
  ...restaurants.map((restaurant) => restaurant.canonicalPath),
]);

if (routes.size !== 1 + 10 + 4 + 4 + summary.provinces.length + summary.cityCount + restaurants.length) {
  throw new Error("Static route inventory contains a duplicate or unexpected count");
}

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.cp(clientRoot, outputRoot, { recursive: true });

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
let nextRoute = 0;
const htmlByRoute = new Map();
const renderWorkers = Array.from({ length: Math.min(12, routeList.length) }, async () => {
  while (nextRoute < routeList.length) {
    const route = routeList[nextRoute++];
    const response = await render(route);
    const html = await response.text();
    if (!/^<!DOCTYPE html>/i.test(html)) throw new Error(`${route} did not return a complete HTML document`);
    if (!html.includes('name="robots" content="noindex, follow"')) throw new Error(`${route} lost the preview noindex safeguard`);
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
if (!/Disallow:\s*\//i.test(robots)) throw new Error("robots.txt must remain fail-closed before editorial launch approval");

console.log(`Exported ${routeList.length} static HTML routes for GitHub Pages.`);
