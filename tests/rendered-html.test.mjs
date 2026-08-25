import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { distanceKm, formatDistance, rankByDistance } from "../lib/geo.ts";
import { createRetryableLoader } from "../lib/retryable-loader.ts";
import { passesPublicationGate, passesSiteLaunchGate } from "../lib/publication-policy.js";

const siteRoot = new URL("../", import.meta.url);
const restaurants = JSON.parse(await readFile(new URL("data/restaurants.json", siteRoot), "utf8"));
const summary = JSON.parse(await readFile(new URL("data/directory-summary.json", siteRoot), "utf8"));
const searchIndex = JSON.parse(await readFile(new URL("public/data/search-index.json", siteRoot), "utf8"));
const curatedSource = JSON.parse(await readFile(new URL("data/curated-additions.source.json", siteRoot), "utf8"));
const rendererContractPaths = [
  "app/restaurants/[province]/[city]/[slug]/page.tsx",
  "app/layout.tsx",
  "app/globals.css",
  "components/Breadcrumbs.tsx",
  "components/FactBadge.tsx",
  "components/RestaurantList.tsx",
  "components/RestaurantCard.tsx",
  "components/SiteHeader.tsx",
  "components/SiteFooter.tsx",
  "components/Logo.tsx",
  "components/SiteLink.tsx",
  "lib/directory.ts",
  "lib/format.ts",
  "lib/site.ts",
];
const rendererContractSources = await Promise.all(rendererContractPaths.map(async (relativePath) => ({
  path: relativePath,
  source: await readFile(new URL(relativePath, siteRoot), "utf8"),
})));

function expectedRendererHash(siteUrl, sourceOverrides = {}) {
  const canonicalSite = new URL(siteUrl);
  return crypto.createHash("sha256").update(JSON.stringify({
    contractVersion: "restaurant-listing-renderer-v1",
    sources: rendererContractSources.map((entry) => ({ ...entry, source: sourceOverrides[entry.path] ?? entry.source })),
    canonicalSiteUrl: siteUrl,
    canonicalOrigin: canonicalSite.origin,
    canonicalHostname: canonicalSite.hostname,
  })).digest("hex");
}

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

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value) {
  return value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

test("generated directory data is complete, unique and route-safe", () => {
  assert.equal(summary.baseRestaurantCount, 380);
  assert.equal(summary.curatedAdditionCount, curatedSource.restaurants.length);
  assert.equal(restaurants.length, summary.baseRestaurantCount + summary.curatedAdditionCount);
  assert.equal(summary.restaurantCount, restaurants.length);
  assert.equal(summary.provinceCount, 10);
  const canonicalCityKeys = new Set(restaurants.map((restaurant) => `${restaurant.provinceSlug}:${restaurant.citySlug}`));
  const summaryCityKeys = summary.provinces.flatMap((province) => province.cities.map((city) => `${province.slug}:${city.slug}`));
  assert.equal(summary.cityCount, canonicalCityKeys.size);
  assert.equal(new Set(summaryCityKeys).size, summary.cityCount, "city summary rows must map one-to-one to canonical hub routes");
  assert.deepEqual(new Set(summaryCityKeys), canonicalCityKeys);
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
    assert.equal(restaurant.publication.rendererHash, expectedRendererHash("https://ramenscout.ca"));
  }

  for (const record of searchIndex) {
    assert.ok(paths.has(record.path), `search record ${record.id} must resolve to a detail route`);
    assert.ok(Number.isFinite(record.latitude) && Number.isFinite(record.longitude), `search record ${record.id} must have usable coordinates`);
  }
});

test("publication renderer hashes bind the exact listing source and canonical origin", () => {
  const expected = expectedRendererHash("https://ramenscout.ca");
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.ok(restaurants.every((restaurant) => restaurant.publication.rendererHash === expected));
  assert.notEqual(expectedRendererHash("https://preview.ramenscout.ca"), expected, "a canonical-origin change must invalidate approval hashes");
  assert.notEqual(
    expectedRendererHash("https://ramenscout.ca", {
      "components/Breadcrumbs.tsx": `${rendererContractSources.find((entry) => entry.path === "components/Breadcrumbs.tsx").source}\n// transitive renderer changed`,
    }),
    expected,
    "a transitive listing dependency change must invalidate approval hashes",
  );
});

test("curated discoveries retain every researched menu item in listings and search", () => {
  const runtimeById = new Map(restaurants.map((restaurant) => [restaurant.placeId, restaurant]));
  const searchById = new Map(searchIndex.map((record) => [record.id, record]));
  for (const candidate of curatedSource.restaurants) {
    const runtime = runtimeById.get(candidate.googlePlaceId);
    assert.ok(runtime, `${candidate.sourceKey} must exist in generated data`);
    assert.equal(runtime.menu.items.length, candidate.menu.items.length, `${candidate.sourceKey} must retain its complete researched menu`);
    assert.deepEqual(runtime.menu.items.map((item) => item.name), candidate.menu.items.map((item) => item.name));
    assert.deepEqual(searchById.get(runtime.id).signatureItems, candidate.menu.items.map((item) => item.name));
  }
});

test("nearby ranking calculates useful distances and keeps missing coordinates last", () => {
  const toronto = { latitude: 43.6532, longitude: -79.3832 };
  const montreal = { latitude: 45.5019, longitude: -73.5674 };
  const vancouver = { latitude: 49.2827, longitude: -123.1207 };
  const distanceToMontreal = distanceKm(toronto, montreal);
  assert.ok(distanceToMontreal > 490 && distanceToMontreal < 520);
  assert.equal(formatDistance(0.03), "under 50 m");
  assert.equal(formatDistance(0.42), "400 m");
  assert.deepEqual(
    rankByDistance([
      { id: "missing", latitude: null, longitude: null },
      { id: "vancouver", ...vancouver },
      { id: "montreal", ...montreal },
    ], toronto).map(({ item }) => item.id),
    ["montreal", "vancouver", "missing"],
  );
});

test("the full directory loader retries after a transient failure", async () => {
  let attempts = 0;
  const load = createRetryableLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary failure");
    return ["directory ready"];
  });
  await assert.rejects(load(), /temporary failure/);
  assert.deepEqual(await load(), ["directory ready"]);
  assert.equal(attempts, 2);
  assert.deepEqual(await load(), ["directory ready"]);
  assert.equal(attempts, 2, "a successful request should remain cached");
});

test("production indexing fails closed while no restaurant passes every publication gate", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-directory-data.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, NEXT_PUBLIC_ALLOW_INDEXING: "true" },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /does not pass the national launch gate/i);
});

test("the shared publication gate separates an approved record from an unreviewed one", () => {
  const base = structuredClone(restaurants.find((restaurant) => restaurant.evidence.some((evidence) => ["official_site", "official_menu"].includes(evidence.sourceType) && /^[a-f0-9]{64}$/.test(evidence.contentHash || ""))));
  assert.ok(base);
  const approved = structuredClone(base);
  const approval = {
    restaurantId: approved.id,
    reviewerId: "editor-fixture",
    reviewedAt: "2026-08-24T00:00:00Z",
    schemaValidatedAt: "2026-08-24T00:00:00Z",
    visibleParityCheckedAt: "2026-08-24T00:00:00Z",
    rightsReviewedAt: "2026-08-24T00:00:00Z",
    contentHash: approved.publication.contentHash,
    evidenceHash: approved.publication.evidenceHash,
    schemaHash: approved.publication.schemaHash,
    rendererHash: approved.publication.rendererHash,
    approvalHash: "a".repeat(64),
    approveIndexing: true,
    approveAds: true,
  };
  approved.publication = {
    ...approved.publication,
    status: "published",
    robots: "index,follow",
    adsAllowed: "yes",
    gateStatus: "pass",
    failCodes: [],
    qualityScore: 95,
    verifiedDecisionFieldCount: 7,
    humanReviewedAt: approval.reviewedAt,
    reviewerId: approval.reviewerId,
    approvalHash: approval.approvalHash,
    gates: Object.fromEntries(Object.keys(approved.publication.gates).map((key) => [key, "yes"])),
  };
  approved.relevance.classification = "primary";
  approved.menu.status = "verified_current";
  approved.nextReviewDue = "2026-11-22";
  assert.equal(passesPublicationGate(approved, Date.parse("2026-08-24T00:00:00Z"), approval), true);
  assert.equal(passesPublicationGate(base, Date.parse("2026-08-24T00:00:00Z")), false);
  approved.publication.robots = "index,nofollow";
  assert.equal(passesPublicationGate(approved, Date.parse("2026-08-24T00:00:00Z"), approval), false, "robots must match index,follow exactly");
  approved.publication.robots = "index,follow";
  const staleRendererApproval = { ...approval, rendererHash: "0".repeat(64) };
  assert.equal(passesPublicationGate(approved, Date.parse("2026-08-24T00:00:00Z"), staleRendererApproval), false, "approval must match the current renderer contract");
  const currentRendererHash = approved.publication.rendererHash;
  approved.publication.rendererHash = "0".repeat(64);
  assert.equal(passesPublicationGate(approved, Date.parse("2026-08-24T00:00:00Z"), approval), false, "generated publication state cannot substitute a different renderer hash");
  approved.publication.rendererHash = currentRendererHash;
  const malformedApproval = { ...approval, reviewedAt: "not actually reviewed" };
  approved.publication.humanReviewedAt = malformedApproval.reviewedAt;
  assert.equal(passesPublicationGate(approved, Date.parse("2026-08-24T00:00:00Z"), malformedApproval), false, "review timestamps must be real and non-future");
  assert.equal(passesSiteLaunchGate([approved]), false, "one approval cannot unlock a national site");
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
  assert.match(html, /Verified halal/i);
  assert.match(html, /Unknown values never match a confirmed-feature filter/i);
  assert.match(html, /Use my location/i);
  assert.doesNotMatch(html, /Requesting your location|Sorted by distance/i);
});

test("homepage renders useful discovery content with global preview safeguards", async () => {
  const [html, heroAvif, heroJpeg] = await Promise.all([
    htmlFor("/"),
    readFile(new URL("public/images/ramen-scout-hero.avif", siteRoot)),
    readFile(new URL("public/images/ramen-scout-hero.jpg", siteRoot)),
  ]);
  assert.match(html, /<title>Find ramen near you across Canada \| Ramen Scout Canada<\/title>/i);
  assert.match(html, /<meta[^>]*name="robots"[^>]*content="noindex, follow"/i);
  assert.match(html, /<link[^>]*rel="canonical"[^>]*href="https:\/\/ramenscout\.ca"/i);
  assert.match(html, /<h1>Find ramen near you—without the guesswork\.<\/h1>/i);
  assert.match(html, new RegExp(`>${summary.restaurantCount}<\\/strong>`));
  assert.match(html, new RegExp(`>${summary.cityCount}<\\/strong>|${summary.cityCount} Canadian cities`));
  assert.match(html, /aria-label="Ramen Scout home"/);
  assert.match(html, /Research preview/);
  assert.match(html, /Use my location/i);
  assert.match(html, /coordinates stay in this page/i);
  assert.match(html, /srcSet="\/images\/ramen-scout-hero\.avif"/i);
  assert.match(html, /src="\/images\/ramen-scout-hero\.jpg"/i);
  assert.match(html, /alt="Editorial illustration of a steaming ramen bowl with egg, scallions, nori and mushrooms"/i);
  assert.match(html, /source-linked restaurant listings/i);
  assert.ok(heroAvif.byteLength <= 160_000, `AVIF hero is ${heroAvif.byteLength} bytes`);
  assert.ok(heroJpeg.byteLength <= 300_000, `JPEG hero is ${heroJpeg.byteLength} bytes`);
  const schema = extractJsonLd(html);
  const publisher = schema["@graph"].find((entry) => entry["@type"] === "Organization");
  assert.equal(publisher.name, "Nocturnal Devs");
  assert.equal(publisher.url, "https://www.nocturnaldevs.com/");
  assert.doesNotMatch(html, /adsbygoogle|pagead2|googlesyndication|AggregateRating|reviewCount/i);
});

test("privacy and publisher details match the browser-local location design", async () => {
  const [privacyHtml, homeFinderSource, searchSource] = await Promise.all([
    htmlFor("/privacy"),
    readFile(new URL("../components/NearbyFinder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SearchDirectory.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(privacyHtml, /Nocturnal Devs/);
  assert.match(privacyHtml, /419 Markham Road/);
  assert.match(privacyHtml, /nocturnaldevs@gmail\.com/);
  assert.match(privacyHtml, /does not add them to the URL, cookies, local storage or session storage/i);
  assert.match(privacyHtml, /browser, operating system or device location provider/i);
  assert.match(privacyHtml, /homepage discards them after calculating the nearest matches/i);
  assert.match(homeFinderSource, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(homeFinderSource, /NEARBY_LIMIT = 6/);
  assert.match(homeFinderSource, /aria-label="Nearest ramen restaurants"/);
  assert.match(searchSource, /navigator\.geolocation\.getCurrentPosition/);
  assert.doesNotMatch(`${homeFinderSource}\n${searchSource}`, /localStorage|sessionStorage/);
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

test("a curated discovery renders its specific menu and source-backed details", async () => {
  const restaurant = restaurants.find((entry) => entry.name === "Jinsei Ramen");
  assert.ok(restaurant, "newly discovered Jinsei Ramen must exist");
  const html = await htmlFor(restaurant.canonicalPath);
  assert.match(html, /Jinsei Ramen on Laurier Avenue in Ottawa/i);
  assert.match(html, /Premium Miso Ramen/i);
  assert.match(html, /Spicy Red Tonkotsu/i);
  assert.match(html, /Vegetarian Miso Ramen/i);
  assert.match(html, /300 Laurier Ave W/i);
  assert.match(html, /Sunday[^<]*closed/i);
  assert.match(html, /href="#source-E2"/i);
  assert.match(html, /id="source-E2"/i);
  assert.match(html, /Where these details came from/i);
  assert.match(html, /<meta[^>]*name="robots"[^>]*content="noindex, follow"/i);
  assert.doesNotMatch(html, /AggregateRating|reviewCount|ratingValue|adsbygoogle/i);
});

test("every curated detail page exposes at least 200 useful publisher words", async () => {
  for (const candidate of curatedSource.restaurants) {
    const restaurant = restaurants.find((entry) => entry.placeId === candidate.googlePlaceId);
    assert.ok(restaurant, `${candidate.sourceKey} must resolve`);
    const html = await htmlFor(restaurant.canonicalPath);
    const start = html.indexOf("data-publisher-content");
    const end = html.indexOf('<aside class="listing-sidebar"', start);
    assert.ok(start >= 0 && end > start, `${candidate.sourceKey} must mark its publisher content`);
    const text = visibleText(html.slice(start, end));
    assert.ok(wordCount(text) >= 200, `${candidate.sourceKey} has only ${wordCount(text)} visible publisher words`);
    for (const requiredCopy of [restaurant.content.shortDescription, restaurant.content.bestFor, restaurant.content.neighbourhoodContext].filter(Boolean)) {
      assert.ok(text.includes(requiredCopy), `${candidate.sourceKey} must render its authored decision-useful copy`);
    }
  }
});

test("overnight hours render as next-day service and remain schema-consistent", async () => {
  const momo = restaurants.find((entry) => entry.placeId === "ChIJ330jjXwZpEwRL1Zg5z4gL_s");
  assert.ok(momo);
  const html = await htmlFor(momo.canonicalPath);
  assert.match(visibleText(html), /Friday 11 a\.m\.–2 a\.m\. next day/i);
  const schema = extractJsonLd(html);
  const restaurantSchema = schema["@graph"].find((entry) => entry["@type"] === "Restaurant");
  const friday = restaurantSchema.openingHoursSpecification.find((entry) => entry.dayOfWeek.endsWith("/Friday"));
  assert.equal(friday.opens, "11:00");
  assert.equal(friday.closes, "02:00");

  const hus = restaurants.find((entry) => entry.placeId === "ChIJdzGefcEjoFMRclxgPjwWkpA");
  assert.ok(hus);
  const husHtml = await htmlFor(hus.canonicalPath);
  assert.match(visibleText(husHtml), /Tuesday 5:30 p\.m\.–2 a\.m\. next day/i);
  const husSchema = extractJsonLd(husHtml)["@graph"].find((entry) => entry["@type"] === "Restaurant");
  const tuesday = husSchema.openingHoursSpecification.filter((entry) => entry.dayOfWeek.endsWith("/Tuesday"));
  assert.equal(tuesday.length, 1, "one overnight service period should use one schema interval");
  assert.equal(tuesday[0].opens, "17:30");
  assert.equal(tuesday[0].closes, "02:00");
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
