import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ADSENSE_CLIENT, ADSENSE_SELLER_RECORD } from "../lib/adsense.ts";
import { distanceKm, formatDistance, rankByDistance } from "../lib/geo.ts";
import { createRetryableLoader } from "../lib/retryable-loader.ts";
import { passesPublicationGate, passesSiteLaunchGate } from "../lib/publication-policy.js";
import {
  isCitySearchReady,
  isFacetSearchReady,
  isProvinceSearchReady,
  isRestaurantSearchReady,
  publisherContentWordCount,
} from "../lib/search-readiness.js";
import { deriveSearchReadinessProfile } from "../lib/search-readiness-profile.js";

const siteRoot = new URL("../", import.meta.url);
const restaurants = JSON.parse(await readFile(new URL("data/restaurants.json", siteRoot), "utf8"));
const summary = JSON.parse(await readFile(new URL("data/directory-summary.json", siteRoot), "utf8"));
const searchIndex = JSON.parse(await readFile(new URL("public/data/search-index.json", siteRoot), "utf8"));
const curatedSource = JSON.parse(await readFile(new URL("data/curated-additions.source.json", siteRoot), "utf8"));
const readinessSupplements = JSON.parse(await readFile(new URL("data/search-readiness-supplements.json", siteRoot), "utf8"));
const readinessEnrichments = JSON.parse(await readFile(new URL("data/search-readiness-menu-enrichments.json", siteRoot), "utf8"));
const indexNowKey = "07b7924f1ae8950c2458c04eb4ed55ffcf06ec010530303232a04858611a1ae8";
const rendererContractPaths = [
  "app/restaurants/[province]/[city]/[slug]/page.tsx",
  "app/layout.tsx",
  "app/globals.css",
  "components/Breadcrumbs.tsx",
  "components/FactBadge.tsx",
  "components/RestaurantList.tsx",
  "components/NearbyAlternatives.tsx",
  "lib/menu-planning.ts",
  "lib/geo.ts",
  "components/RestaurantCard.tsx",
  "components/SiteHeader.tsx",
  "components/SiteFooter.tsx",
  "components/Logo.tsx",
  "components/SiteLink.tsx",
  "lib/adsense.ts",
  "lib/directory.ts",
  "lib/format.ts",
  "lib/search-readiness.js",
  "lib/search-readiness-profile.js",
  "lib/site.ts",
];
const rendererContractSources = await Promise.all(rendererContractPaths.map(async (relativePath) => ({
  path: relativePath,
  source: await readFile(new URL(relativePath, siteRoot), "utf8"),
})));
const staticIndexingEnabled = process.env.NEXT_PUBLIC_ALLOW_STATIC_INDEXING === "true";
const allStaticContentPaths = ["/", "/locations", "/about", "/methodology", "/editorial-standards", "/corrections", "/contact", "/privacy", "/accessibility", "/terms", "/guides/choosing-ramen"];
const styleSlugs = ["tonkotsu", "shoyu", "miso", "tsukemen"];
const featureMatchers = {
  "late-night": (restaurant) => restaurant.hours.lateNightStatus === "yes",
  reservations: (restaurant) => ["accepted", "required"].includes(restaurant.reservations.status),
  vegan: (restaurant) => ["one_complete_bowl", "multiple_complete_bowls"].includes(restaurant.vegan.status),
  "house-made-noodles": (restaurant) => restaurant.noodles.status === "made_on_site",
};

function expectedSearchReadyPaths() {
  const restaurantPaths = restaurants.filter((restaurant) => isRestaurantSearchReady(restaurant)).map((restaurant) => restaurant.canonicalPath);
  const cityPaths = summary.provinces.flatMap((province) => province.cities.flatMap((city) => {
    const entries = restaurants.filter((restaurant) => restaurant.provinceSlug === province.slug && restaurant.citySlug === city.slug);
    return isCitySearchReady(entries) ? [`/locations/${province.slug}/${city.slug}`] : [];
  }));
  const provincePaths = summary.provinces.flatMap((province) => {
    const entries = restaurants.filter((restaurant) => restaurant.provinceSlug === province.slug);
    return isProvinceSearchReady(entries) ? [`/locations/${province.slug}`] : [];
  });
  const stylePaths = styleSlugs.flatMap((style) => {
    const entries = restaurants.filter((restaurant) => restaurant.taxonomy[style] === "yes");
    return isFacetSearchReady(entries) ? [`/styles/${style}`] : [];
  });
  const featurePaths = Object.entries(featureMatchers).flatMap(([feature, matches]) => {
    const entries = restaurants.filter(matches);
    return isFacetSearchReady(entries) ? [`/features/${feature}`] : [];
  });
  return { restaurantPaths, cityPaths, provincePaths, stylePaths, featurePaths, all: [...allStaticContentPaths, ...provincePaths, ...cityPaths, ...stylePaths, ...featurePaths, ...restaurantPaths] };
}

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

test("IndexNow ownership uses one valid root key file", async () => {
  const content = await readFile(new URL(`public/${indexNowKey}.txt`, siteRoot), "utf8");
  assert.equal(content.trim(), indexNowKey);
  assert.match(indexNowKey, /^[A-Za-z0-9-]{8,128}$/);
});

test("AdSense review identity uses the authenticated publisher and an exact seller record", async () => {
  const [homeHtml, adsTxt] = await Promise.all([
    htmlFor("/"),
    readFile(new URL("public/ads.txt", siteRoot), "utf8"),
  ]);
  assert.match(homeHtml, new RegExp(`<meta[^>]*name="google-adsense-account"[^>]*content="${ADSENSE_CLIENT}"`, "i"));
  assert.equal(adsTxt.trim(), ADSENSE_SELLER_RECORD);
  assert.doesNotMatch(homeHtml, /adsbygoogle|pagead2|googlesyndication/i, "site review must not silently enable ad requests");
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

test("fresh Crawl4AI supplements promote only listings whose live facts clear the quality gate", () => {
  assert.equal(readinessSupplements.schemaVersion, "1.0");
  assert.equal(readinessSupplements.records.length, 114);
  assert.equal(readinessSupplements.rejected.length, 0);
  assert.equal(new Set(readinessSupplements.records.map((record) => record.restaurantId)).size, readinessSupplements.records.length);
  const now = Date.now();
  for (const record of readinessSupplements.records) {
    const restaurant = restaurants.find((entry) => entry.id === record.restaurantId);
    assert.ok(restaurant, `${record.restaurantId} must resolve to a generated listing`);
    assert.equal(record.crawl4aiSuccess, true);
    assert.ok(["crawl4ai_normalized_markdown", "crawl4ai_page_plus_verified_document"].includes(record.extractionMethod));
    assert.equal(record.url, restaurant.menu.url);
    assert.ok(record.statusCode >= 200 && record.statusCode < 400);
    assert.match(record.contentHash, /^[a-f0-9]{64}$/);
    assert.match(record.pageContentHash, /^[a-f0-9]{64}$/);
    assert.ok(record.markdownChars >= 200);
    if (record.extractionMethod === "crawl4ai_page_plus_verified_document") {
      assert.ok(record.linkedDocuments.length > 0);
      for (const document of record.linkedDocuments) {
        assert.match(document.url, /^https:\/\//);
        assert.match(document.finalUrl, /^https:\/\//);
        assert.match(document.contentType, /^(?:image\/|application\/pdf$)/);
        assert.ok(document.bytes >= 1_000);
        assert.match(document.contentHash, /^[a-f0-9]{64}$/);
      }
      assert.equal(record.contentHash, crypto.createHash("sha256").update(JSON.stringify({
        pageContentHash: record.pageContentHash,
        linkedDocuments: record.linkedDocuments,
      })).digest("hex"));
    } else {
      assert.deepEqual(record.linkedDocuments, []);
      assert.equal(record.contentHash, record.pageContentHash);
    }
    const capturedAt = Date.parse(record.retrievedAt);
    assert.ok(Number.isFinite(capturedAt) && capturedAt <= now + 5 * 60 * 1000 && now - capturedAt <= 120 * 24 * 60 * 60 * 1000);
    assert.equal(Object.hasOwn(record, "markdown"), false, "source prose must not be copied into the supplement registry");
    assert.deepEqual(restaurant.publication.searchReadinessSupplement, {
      verifiedAt: record.retrievedAt,
      url: record.url,
      finalUrl: record.finalUrl,
      extractionMethod: record.extractionMethod,
      contentHash: record.contentHash,
      pageContentHash: record.pageContentHash,
      statusCode: record.statusCode,
      markdownChars: record.markdownChars,
      linkedDocuments: record.linkedDocuments,
      crawl4aiSuccess: true,
      corroboration: record.corroboration,
      qualityScore: record.derivedQualityScore,
      verifiedDecisionFieldCount: record.derivedDecisionFieldCount,
      verifiedDecisionGroups: record.verifiedDecisionGroups,
    });
    const source = restaurant.evidence.find((evidence) => evidence.id === "SR1");
    assert.ok(source, `${restaurant.name} must expose its fresh first-party source`);
    assert.equal(source.url, record.url);
    assert.equal(source.contentHash, record.contentHash);
    assert.equal(source.retrievedAt, record.retrievedAt);
    assert.ok(restaurant.menu.evidenceRefs.includes("SR1"));
    const profile = deriveSearchReadinessProfile(restaurant, now);
    assert.equal(profile.qualityScore, record.derivedQualityScore);
    assert.equal(profile.decisionFieldCount, record.derivedDecisionFieldCount);
    assert.deepEqual(Object.entries(profile.facts).filter(([, verified]) => verified).map(([group]) => group), record.verifiedDecisionGroups);
    assert.equal(isRestaurantSearchReady(restaurant, now), restaurant.id !== "ramen_ca_1d358958d30659cd7b34", "a new menu capture must not override Shiki Menya's unresolved evidence gate");
  }

  const fixture = structuredClone(restaurants.find((restaurant) => restaurant.publication.searchReadinessSupplement));
  assert.ok(fixture);
  fixture.publication.searchReadinessSupplement.contentHash = "0".repeat(64);
  assert.equal(isRestaurantSearchReady(fixture, now), false, "a supplement detached from its evidence hash must fail closed");
  fixture.publication.searchReadinessSupplement.contentHash = fixture.evidence.find((evidence) => evidence.id === "SR1").contentHash;
  fixture.publication.searchReadinessSupplement.verifiedAt = "2025-01-01T00:00:00.000Z";
  assert.equal(isRestaurantSearchReady(fixture, now), false, "a stale supplement must fail closed");
});

test("item-level menu repairs remain evidence-linked, specific and conservative", () => {
  assert.equal(readinessEnrichments.schemaVersion, "1.0");
  assert.equal(readinessEnrichments.records.length, 69);
  for (const enrichment of readinessEnrichments.records) {
    const restaurant = restaurants.find((entry) => entry.id === enrichment.restaurantId);
    const supplement = readinessSupplements.records.find((entry) => entry.restaurantId === enrichment.restaurantId);
    assert.ok(restaurant, `${enrichment.restaurantId} must resolve`);
    assert.ok(supplement, `${enrichment.restaurantId} must retain a current crawl supplement`);
    assert.equal(restaurant.menu.url, enrichment.menuUrl);
    assert.equal(restaurant.menu.itemCount, enrichment.permanentItemCount);
    assert.deepEqual(restaurant.menu.items.map((item) => item.name), enrichment.items.map((item) => item.name));
    assert.ok(restaurant.menu.items.every((item) => item.evidenceRefs.includes("SR1")));
    assert.equal(isRestaurantSearchReady(restaurant), restaurant.id !== "ramen_ca_1d358958d30659cd7b34");
    if (enrichment.prices) {
      assert.equal(restaurant.prices.observedCount, enrichment.prices.observedCount);
      assert.ok(restaurant.prices.evidenceRefs.includes("SR1"));
      assert.equal(restaurant.prices.verifiedAt, supplement.retrievedAt);
    }
    if (enrichment.taxonomy) {
      assert.ok(restaurant.taxonomy.evidenceRefs.includes("SR1"));
      assert.equal(restaurant.taxonomy.verifiedAt, supplement.retrievedAt);
    }
    if (enrichment.noodles) {
      assert.ok(restaurant.noodles.evidenceRefs.includes("SR1"));
      assert.equal(restaurant.noodles.verifiedAt, supplement.retrievedAt);
    }
  }
  const raijin = restaurants.find((restaurant) => restaurant.id === "ramen_ca_f56b3a4d9e2ec94ce1bc");
  assert.equal(raijin.vegan.status, "one_complete_bowl");
  assert.deepEqual(raijin.vegan.itemNames, ["Vegan Spicy Miso Ramen"]);
  assert.ok(raijin.vegan.evidenceRefs.includes("SR1"));
  const remix = restaurants.find((restaurant) => restaurant.id === "ramen_ca_4e3ef8a7d78b95525556");
  assert.equal(remix.prices.observedCount, 0, "Ramen x Remix must not invent prices the menu does not publish");
  assert.equal(remix.vegan.status, "unknown", "a vegetarian seasonal special must not be promoted to verified vegan");
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

test("homepage renders useful discovery content with staged indexing safeguards", async () => {
  const [html, heroAvif, heroJpeg] = await Promise.all([
    htmlFor("/"),
    readFile(new URL("public/images/ramen-scout-hero.avif", siteRoot)),
    readFile(new URL("public/images/ramen-scout-hero.jpg", siteRoot)),
  ]);
  assert.match(html, /<title>Find ramen near you across Canada \| Ramen Scout Canada<\/title>/i);
  assert.match(html, new RegExp(`<meta[^>]*name="robots"[^>]*content="${staticIndexingEnabled ? "index, follow" : "noindex, follow"}`, "i"));
  assert.match(html, /<link[^>]*rel="canonical"[^>]*href="https:\/\/ramenscout\.ca"/i);
  assert.match(html, /<h1>Find ramen near you—without the guesswork\.<\/h1>/i);
  assert.match(html, new RegExp(`>${summary.restaurantCount}<\\/strong>`));
  assert.match(html, new RegExp(`>${summary.cityCount}<\\/strong>|${summary.cityCount} Canadian cities`));
  assert.match(html, /aria-label="Ramen Scout home"/);
  assert.doesNotMatch(html, /Research preview|Preview status|Listings remain noindexed/i);
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
  assert.match(html, new RegExp(`<meta[^>]*name="google-adsense-account"[^>]*content="${ADSENSE_CLIENT}"`, "i"));
  assert.doesNotMatch(html, /adsbygoogle|pagead2|googlesyndication|AggregateRating|reviewCount/i);
});

test("privacy, Analytics and publisher details match the implemented data flows", async () => {
  const [privacyHtml, homeFinderSource, searchSource, analyticsSource, layoutSource] = await Promise.all([
    htmlFor("/privacy"),
    readFile(new URL("../components/NearbyFinder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SearchDirectory.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FirebaseAnalytics.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(privacyHtml, /Nocturnal Devs/);
  assert.match(privacyHtml, /419 Markham Road/);
  assert.match(privacyHtml, /nocturnaldevs@gmail\.com/);
  assert.match(privacyHtml, /does not add them to the URL, cookies, local storage or session storage/i);
  assert.match(privacyHtml, /browser, operating system or device location provider/i);
  assert.match(privacyHtml, /homepage discards them after calculating the nearest matches/i);
  assert.match(privacyHtml, /uses Firebase Analytics, a Google Analytics service/i);
  assert.match(privacyHtml, /Google Analytics opt-out browser add-on/i);
  assert.match(privacyHtml, /connected to Google AdSense for domain ownership verification and program review/i);
  assert.match(privacyHtml, /ad-serving code and manual ad units are not active/i);
  assert.match(privacyHtml, /Google’s certified consent-management message/i);
  assert.match(analyticsSource, /G-KKD42WHEGE/);
  assert.match(analyticsSource, /firebase\/analytics/);
  assert.match(layoutSource, /<FirebaseAnalytics \/>/);
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
  assert.equal(isRestaurantSearchReady(restaurant), false, "the weak-menu fixture must remain excluded from search indexing");
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
  assert.equal(restaurantSchema.servesCuisine, undefined, "uncertain ramen relevance must not be asserted in schema");
  assert.doesNotMatch(JSON.stringify(schema), /AggregateRating|reviewCount|ratingValue|"review"/i);
  assert.doesNotMatch(html, /quality_score|gate_human_review|staging_media|adsbygoogle/i);
});

test("a curated discovery renders its specific menu and source-backed details", async () => {
  const restaurant = restaurants.find((entry) => entry.name === "Jinsei Ramen");
  assert.ok(restaurant, "newly discovered Jinsei Ramen must exist");
  assert.equal(isRestaurantSearchReady(restaurant), true, "the complete, source-backed fixture should be search-ready");
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
  assert.match(html, new RegExp(`<meta[^>]*name="robots"[^>]*content="${staticIndexingEnabled ? "index, follow" : "noindex, follow"}`, "i"));
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
    for (const requiredCopy of [restaurant.content.editorialDescription].filter(Boolean)) {
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
    "/features/house-made-noodles",
    "/about",
    "/methodology",
    "/editorial-standards",
    "/corrections",
    "/contact",
    "/privacy",
    "/accessibility",
    "/terms",
  ];
  for (const route of routes) {
    const html = await htmlFor(route);
    assert.match(html, /<h1[ >]/i, `${route} should have one primary heading`);
    const pathname = route.split("?")[0];
    const indexable = staticIndexingEnabled && expectedSearchReadyPaths().all.includes(pathname);
    assert.match(html, new RegExp(`<meta[^>]*name="robots"[^>]*content="${indexable ? "index, follow" : "noindex, follow"}`, "i"));
  }
});

test("location pages use their own canonical and social URL", async () => {
  const html = await htmlFor("/locations/on/toronto");
  assert.match(html, /<link[^>]*rel="canonical"[^>]*href="https:\/\/ramenscout\.ca\/locations\/on\/toronto"/i);
  assert.match(html, /<meta[^>]*property="og:url"[^>]*content="https:\/\/ramenscout\.ca\/locations\/on\/toronto"/i);
  assert.match(html, /<meta[^>]*property="og:title"[^>]*content="Ramen restaurants in Toronto, ON \| Ramen Scout Canada"/i);
  assert.doesNotMatch(html, /property="og:url" content="https:\/\/ramenscout\.ca"\s*\/>/i);
});

test("robots and sitemap expose the intended canonical inventory", async () => {
  const robotsResponse = await render("/robots.txt");
  assert.equal(robotsResponse.status, 200);
  const robots = await robotsResponse.text();

  const sitemapResponse = await render("/sitemap.xml");
  assert.equal(sitemapResponse.status, 200);
  const sitemap = await sitemapResponse.text();
  assert.match(sitemap, /<urlset\b/);
  if (staticIndexingEnabled) {
    assert.match(robots, /^Allow:\s*\/\s*$/im);
    assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/im);
    assert.match(robots, /Sitemap: https:\/\/ramenscout\.ca\/sitemap\.xml/i);
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
    const ready = expectedSearchReadyPaths();
    const expectedPaths = ready.all;
    const expectedUrls = expectedPaths.map((path) => `https://ramenscout.ca${path}`).sort();
    assert.deepEqual(urls, expectedUrls);
    assert.doesNotMatch(sitemap, /\/search(?:<|\?|\/)/i);
    assert.equal(ready.restaurantPaths.length, 189);
    assert.equal(ready.cityPaths.length, 12);
    assert.equal(ready.provincePaths.length, 4);
    assert.equal(ready.stylePaths.length, 4);
    assert.deepEqual(ready.featurePaths.sort(), ["/features/late-night", "/features/reservations", "/features/vegan"]);
    assert.equal(urls.length, 223, "the existing 222 canonical pages plus the researched comparison guide should be submitted");
  } else {
    assert.match(robots, /User-Agent: \*\s+Disallow: \//i);
    assert.doesNotMatch(sitemap, /<url>/);
  }
});

test("search-ready listings meet the anti-thin-content and originality gates", () => {
  const ready = restaurants.filter((restaurant) => isRestaurantSearchReady(restaurant));
  assert.equal(ready.length, 189);
  assert.equal(restaurants.length - ready.length, 224, "weaker listings must remain noindex rather than entering the sitemap");

  const shortDescriptions = new Set();
  const editorialDescriptions = new Set();
  for (const restaurant of ready) {
    assert.ok(publisherContentWordCount(restaurant) >= 200, `${restaurant.name} needs at least 200 authored words`);
    assert.ok(["primary", "substantial"].includes(restaurant.relevance.classification));
    assert.equal(restaurant.menu.status, "verified_current");
    const profile = deriveSearchReadinessProfile(restaurant);
    const supplement = restaurant.publication.searchReadinessSupplement;
    assert.ok(Math.max(restaurant.publication.qualityScore, supplement ? profile.qualityScore : 0) >= 90);
    assert.ok(Math.max(restaurant.publication.verifiedDecisionFieldCount, supplement ? profile.decisionFieldCount : 0) >= 6);
    assert.ok(!shortDescriptions.has(restaurant.content.shortDescription), `${restaurant.name} repeats a short description`);
    assert.ok(!editorialDescriptions.has(restaurant.content.editorialDescription), `${restaurant.name} repeats an editorial description`);
    shortDescriptions.add(restaurant.content.shortDescription);
    editorialDescriptions.add(restaurant.content.editorialDescription);
  }

  function fiveGrams(value) {
    const words = value.toLocaleLowerCase("en-CA").match(/[\p{L}\p{N}]+/gu) || [];
    return new Set(Array.from({ length: Math.max(0, words.length - 4) }, (_, index) => words.slice(index, index + 5).join(" ")));
  }
  let maxJaccard = 0;
  for (let left = 0; left < ready.length; left += 1) {
    const leftGrams = fiveGrams(ready[left].content.editorialDescription);
    for (let right = left + 1; right < ready.length; right += 1) {
      const rightGrams = fiveGrams(ready[right].content.editorialDescription);
      const intersection = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
      const union = new Set([...leftGrams, ...rightGrams]).size;
      maxJaccard = Math.max(maxJaccard, union ? intersection / union : 0);
    }
  }
  assert.ok(maxJaccard < 0.15, `editorial similarity is too high: ${maxJaccard.toFixed(4)}`);
});

test("unknown paths return a true 404", async () => {
  const response = await render("/restaurants/on/toronto/not-a-real-restaurant");
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /This bowl is not on the menu/i);
  assert.match(html, /<title>Page not found \| Ramen Scout Canada<\/title>/i);
  assert.match(html, /<meta[^>]*name="robots"[^>]*content="noindex(?:, follow)?"/i);
  assert.doesNotMatch(html, /rel="canonical"/i);
  assert.doesNotMatch(html, /property="og:url"/i);
});
