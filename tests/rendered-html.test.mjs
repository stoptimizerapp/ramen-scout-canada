import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const siteRoot = new URL("../", import.meta.url);
const restaurants = JSON.parse(await readFile(new URL("data/restaurants.json", siteRoot), "utf8"));
const summary = JSON.parse(await readFile(new URL("data/directory-summary.json", siteRoot), "utf8"));
const searchIndex = JSON.parse(await readFile(new URL("public/data/search-index.json", siteRoot), "utf8"));

let workerPromise;

async function getWorker() {
  workerPromise ??= import(new URL("../dist/server/index.js", import.meta.url).href).then((module) => module.default);
  return workerPromise;
}

async function render(pathname = "/") {
  const worker = await getWorker();
  return worker.fetch(
    new Request(new URL(pathname, "http://localhost"), { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function htmlFor(pathname) {
  const response = await render(pathname);
  assert.equal(response.status, 200, `${pathname} should render`);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  return response.text();
}

function extractJsonLd(html) {
  const match = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, "expected visible JSON-LD script");
  return JSON.parse(match[1]);
}

function extractTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  assert.ok(match, "expected page title");
  return match[1].replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'");
}

test("generated directory data is complete, unique and route-safe", () => {
  assert.equal(restaurants.length, 380);
  assert.equal(summary.restaurantCount, 380);
  assert.equal(summary.provinceCount, 10);
  assert.equal(summary.cityCount, 93);
  assert.equal(searchIndex.length, restaurants.length);

  for (const key of ["id", "placeId", "canonicalPath"]) {
    assert.equal(new Set(restaurants.map((restaurant) => restaurant[key])).size, restaurants.length, `${key} must be unique`);
  }

  const paths = new Set(restaurants.map((restaurant) => restaurant.canonicalPath));
  for (const restaurant of restaurants) {
    assert.equal(
      restaurant.canonicalPath,
      `/restaurants/${restaurant.provinceSlug}/${restaurant.citySlug}/${restaurant.slug}`,
    );
    assert.equal(restaurant.publication.status, "needs_review");
    assert.equal(restaurant.publication.adsAllowed, "no");
    assert.notEqual(restaurant.publication.gateStatus, "pass");
    assert.equal(restaurant.publication.gates.humanReview, "no");
    assert.equal(typeof restaurant.publication.qualityScore, "number");
  }

  for (const record of searchIndex) {
    assert.ok(paths.has(record.path), `search record ${record.id} must resolve to a detail route`);
  }
});

test("production indexing fails closed while no restaurant passes every publication gate", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-directory-data.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, NEXT_PUBLIC_ALLOW_INDEXING: "true" },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /no restaurant passes the complete publication gate/i);
});

test("public search data exposes useful fields without ratings, staged media or internal QA", () => {
  const allowedKeys = [
    "address", "alternateNames", "brandName", "branchName", "city", "citySlug", "description",
    "fsa", "halalVerified", "id", "lateNight", "latitude", "longitude", "menuStatus",
    "menuVerifiedAt", "name", "neighbourhood", "noodlesStatus", "path", "postalCode",
    "priceBand", "priceMax", "priceMin", "province", "provinceCode", "reservations",
    "shoyu", "signatureItems", "miso", "styles", "tonkotsu", "tsukemen", "veganStatus",
  ].sort();
  for (const record of searchIndex) {
    assert.deepEqual(Object.keys(record).sort(), allowedKeys);
  }
  assert.ok(searchIndex.every((record) => typeof record.description === "string" && record.description.length > 40));
  assert.ok(searchIndex.every((record) => ["yes", "no", "unknown"].includes(record.tonkotsu)));
  assert.ok(searchIndex.some((record) => record.alternateNames.length > 0));
  assert.ok(searchIndex.some((record) => record.signatureItems.length > 0));
  assert.ok(searchIndex.every((record) => record.tonkotsu !== "yes" || record.styles.includes("tonkotsu")));
});

test("search renders a bounded useful first page and keeps query filters noindexed", async () => {
  const html = await htmlFor("/search?q=miso&feature=miso");
  const articleCount = (html.match(/<article class="search-result"/g) ?? []).length;
  const embeddedRecordCount = searchIndex.filter((record) => html.includes(record.id)).length;

  assert.ok(articleCount > 0 && articleCount <= 24, "search should server-render at most the first 24 matches");
  assert.equal(embeddedRecordCount, articleCount, "search HTML should embed only its first rendered records");
  assert.match(html, /<meta[^>]*name="robots"[^>]*content="noindex, follow"/i);
  assert.match(html, /value="miso"/i);
  assert.match(html, /Only show confirmed features/i);
  assert.match(html, /Unknown values never match a confirmed-feature filter/i);
  assert.doesNotMatch(html, /Requesting your location|Sorted by distance/i);
});

test("homepage renders useful discovery content with global preview safeguards", async () => {
  const html = await htmlFor("/");
  assert.match(html, /<title>Find ramen near you across Canada \| Ramen Scout Canada<\/title>/i);
  assert.match(html, /<meta[^>]*name="robots"[^>]*content="noindex, follow"/i);
  assert.match(html, /<link[^>]*rel="canonical"[^>]*href="https:\/\/ramenscout\.ca"/i);
  assert.match(html, /<h1>Find ramen near you—without the guesswork\.<\/h1>/i);
  assert.match(html, />380<\/strong>/);
  assert.match(html, />93<\/strong>|93 Canadian cities/);
  assert.match(html, /aria-label="Ramen Scout home"/);
  assert.match(html, /Research preview/);
  assert.doesNotMatch(html, /adsbygoogle|pagead2|googlesyndication|AggregateRating|reviewCount/i);
});

test("restaurant detail renders canonical facts, cautious unknowns and valid rating-free schema", async () => {
  const restaurant = restaurants.find((entry) => entry.id === "ramen_ca_043dfb6c999bc76429bd");
  assert.ok(restaurant, "Kajiken QA fixture must exist");
  const html = await htmlFor(restaurant.canonicalPath);

  const escapedH1 = restaurant.seo.h1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(html, new RegExp(`<h1>${escapedH1}<\\/h1>`));
  assert.match(html, /<meta[^>]*name="robots"[^>]*content="noindex, follow"/i);
  assert.match(html, new RegExp(`<link[^>]*rel="canonical"[^>]*href="https://ramenscout\\.ca${restaurant.canonicalPath}"`, "i"));
  assert.equal(extractTitle(html), restaurant.seo.title);
  assert.match(html, /Ramen style not confirmed|Not confirmed/);
  assert.match(html, /Where these details came from/);
  assert.match(html, /Report a correction/);

  const schema = extractJsonLd(html);
  const graph = schema["@graph"];
  const restaurantSchema = graph.find((entry) => entry["@type"] === "Restaurant");
  assert.equal(restaurantSchema.name, restaurant.name);
  assert.equal(restaurantSchema.address.addressLocality, restaurant.location.city);
  assert.equal(restaurantSchema.url, `https://ramenscout.ca${restaurant.canonicalPath}`);
  assert.doesNotMatch(JSON.stringify(schema), /AggregateRating|reviewCount|ratingValue|"review"/i);
  assert.doesNotMatch(html, /quality_score|gate_human_review|staging_media|adsbygoogle/i);
});

test("representative location, style, feature and policy routes render", async () => {
  const routes = [
    "/search?q=miso",
    "/locations",
    "/locations/on",
    "/locations/on/toronto",
    "/locations/yt/whitehorse",
    "/styles/miso",
    "/features/late-night",
    "/about",
    "/methodology",
    "/editorial-standards",
    "/corrections",
    "/privacy",
    "/accessibility",
    "/terms",
  ];
  for (const route of routes) {
    const html = await htmlFor(route);
    assert.match(html, /<h1[ >]/i, `${route} should have one primary heading`);
    assert.match(html, /<meta[^>]*name="robots"[^>]*content="noindex, follow"/i);
  }
});

test("location pages use their own canonical and social URL", async () => {
  const html = await htmlFor("/locations/on/toronto");
  assert.match(html, /<link[^>]*rel="canonical"[^>]*href="https:\/\/ramenscout\.ca\/locations\/on\/toronto"/i);
  assert.match(html, /<meta[^>]*property="og:url"[^>]*content="https:\/\/ramenscout\.ca\/locations\/on\/toronto"/i);
  assert.match(html, /<meta[^>]*property="og:title"[^>]*content="Ramen restaurants in Toronto, ON \| Ramen Scout Canada"/i);
  assert.doesNotMatch(html, /property="og:url" content="https:\/\/ramenscout\.ca"\s*\/>/i);
});

test("preview robots and sitemap expose no crawlable inventory", async () => {
  const robotsResponse = await render("/robots.txt");
  assert.equal(robotsResponse.status, 200);
  assert.match(await robotsResponse.text(), /User-Agent: \*\s+Disallow: \//i);

  const sitemapResponse = await render("/sitemap.xml");
  assert.equal(sitemapResponse.status, 200);
  const sitemap = await sitemapResponse.text();
  assert.match(sitemap, /<urlset\b/);
  assert.doesNotMatch(sitemap, /<url>/);
});

test("unknown paths return a true 404", async () => {
  const response = await render("/restaurants/on/toronto/not-a-real-restaurant");
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /This bowl is not on the menu/i);
  assert.match(html, /<title>Page not found \| Ramen Scout Canada<\/title>/i);
  assert.doesNotMatch(html, /rel="canonical"/i);
  assert.doesNotMatch(html, /property="og:url"/i);
});
