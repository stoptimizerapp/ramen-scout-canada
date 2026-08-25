import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isCitySearchReady,
  isFacetSearchReady,
  isProvinceSearchReady,
  isRestaurantSearchReady,
  publisherContentWordCount,
} from "../lib/search-readiness.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "pages-out");
const origin = "https://ramenscout.ca";
const [restaurants, summary] = await Promise.all([
  fs.readFile(path.join(root, "data", "restaurants.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(root, "data", "directory-summary.json"), "utf8").then(JSON.parse),
]);

const staticRoutes = ["/", "/locations", "/about", "/methodology", "/editorial-standards", "/corrections", "/contact", "/privacy", "/accessibility", "/terms"];
const styleSlugs = ["tonkotsu", "shoyu", "miso", "tsukemen"];
const featureMatchers = {
  "late-night": (restaurant) => restaurant.hours.lateNightStatus === "yes",
  reservations: (restaurant) => ["accepted", "required"].includes(restaurant.reservations.status),
  vegan: (restaurant) => ["one_complete_bowl", "multiple_complete_bowls"].includes(restaurant.vegan.status),
  "house-made-noodles": (restaurant) => restaurant.noodles.status === "made_on_site",
};

const restaurantRoutes = restaurants.map((restaurant) => restaurant.canonicalPath);
const cityRoutes = summary.provinces.flatMap((province) => province.cities.map((city) => `/locations/${province.slug}/${city.slug}`));
const provinceRoutes = summary.provinces.map((province) => `/locations/${province.slug}`);
const styleRoutes = styleSlugs.map((style) => `/styles/${style}`);
const featureRoutes = Object.keys(featureMatchers).map((feature) => `/features/${feature}`);
const canonicalRoutes = new Set([...staticRoutes, ...restaurantRoutes, ...cityRoutes, ...provinceRoutes, ...styleRoutes, ...featureRoutes]);

const readyRestaurantRoutes = restaurants.filter((restaurant) => isRestaurantSearchReady(restaurant)).map((restaurant) => restaurant.canonicalPath);
const readyCityRoutes = summary.provinces.flatMap((province) => province.cities.flatMap((city) => {
  const entries = restaurants.filter((restaurant) => restaurant.provinceSlug === province.slug && restaurant.citySlug === city.slug);
  return isCitySearchReady(entries) ? [`/locations/${province.slug}/${city.slug}`] : [];
}));
const readyProvinceRoutes = summary.provinces.flatMap((province) => {
  const entries = restaurants.filter((restaurant) => restaurant.provinceSlug === province.slug);
  return isProvinceSearchReady(entries) ? [`/locations/${province.slug}`] : [];
});
const readyStyleRoutes = styleSlugs.flatMap((style) => {
  const entries = restaurants.filter((restaurant) => restaurant.taxonomy[style] === "yes");
  return isFacetSearchReady(entries) ? [`/styles/${style}`] : [];
});
const readyFeatureRoutes = Object.entries(featureMatchers).flatMap(([feature, matches]) => {
  const entries = restaurants.filter(matches);
  return isFacetSearchReady(entries) ? [`/features/${feature}`] : [];
});
const indexableRoutes = new Set([...staticRoutes, ...readyRestaurantRoutes, ...readyCityRoutes, ...readyProvinceRoutes, ...readyStyleRoutes, ...readyFeatureRoutes]);

function routeFile(route) {
  return route === "/" ? path.join(output, "index.html") : path.join(output, route.slice(1), "index.html");
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] ?? "";
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function visibleText(html) {
  return decodeEntities(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value) {
  return value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function normalized(value) {
  return decodeEntities(value).toLocaleLowerCase("en-CA").replace(/\s+/g, " ").trim();
}

function fiveGrams(value) {
  const words = normalized(value).match(/[\p{L}\p{N}]+/gu) || [];
  return new Set(Array.from({ length: Math.max(0, words.length - 4) }, (_, index) => words.slice(index, index + 5).join(" ")));
}

const sitemap = await fs.readFile(path.join(output, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
const expectedUrls = [...indexableRoutes].map((route) => `${origin}${route}`).sort();
assert.deepEqual(sitemapUrls, expectedUrls, "sitemap must contain exactly the quality-gated canonical inventory");

const titles = new Map();
const descriptions = new Map();
const headings = new Map();
const inboundLinks = new Map([...canonicalRoutes].map((route) => [route, new Set()]));
let parsedSchemaBlocks = 0;

for (const route of canonicalRoutes) {
  const html = await fs.readFile(routeFile(route), "utf8");
  const shouldIndex = indexableRoutes.has(route);
  const robotsTag = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0];
  assert.ok(robotsTag, `${route} needs a robots directive`);
  assert.equal(attribute(robotsTag, "content"), shouldIndex ? "index, follow" : "noindex, follow", `${route} has the wrong robots directive`);

  const canonicalTag = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0];
  assert.ok(canonicalTag, `${route} needs a canonical URL`);
  assert.equal(attribute(canonicalTag, "href"), `${origin}${route === "/" ? "" : route}`, `${route} canonical mismatch`);

  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const descriptionTag = html.match(/<meta\b[^>]*name=["']description["'][^>]*>/i)?.[0] ?? "";
  const description = attribute(descriptionTag, "content");
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => visibleText(match[1]));
  assert.ok(title, `${route} needs a title`);
  assert.ok(description, `${route} needs a meta description`);
  assert.equal(h1s.length, 1, `${route} needs exactly one H1`);

  if (shouldIndex) {
    for (const [label, value, collection] of [["title", title, titles], ["description", description, descriptions], ["H1", h1s[0], headings]]) {
      const key = normalized(value);
      assert.ok(!collection.has(key), `${route} repeats ${label} from ${collection.get(key)}`);
      collection.set(key, route);
    }
    const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? "";
    const minimum = staticRoutes.includes(route) ? 120 : 300;
    assert.ok(wordCount(visibleText(main)) >= minimum, `${route} has too little visible main content`);
  }

  assert.doesNotMatch(html, /<script\b[^>]*src=["'][^"']*(?:pagead2|googlesyndication)|\bdata-ad-client=|class=["'][^"']*adsbygoogle/i, `${route} must not load unconfigured ads`);
  assert.doesNotMatch(html, /<(?:img|source)\b[^>]*(?:googleusercontent|ggpht|google\.com\/maps)/i, `${route} must not publish staged Google media`);
  assert.doesNotMatch(html, /<meta\b[^>]*name=["']keywords["']/i, `${route} must not use keyword-stuffing metadata`);

  for (const match of html.matchAll(/\bhref=["'](\/[^"']*)["']/gi)) {
    const targetUrl = new URL(match[1], origin);
    const target = decodeURI(targetUrl.pathname).replace(/\/$/, "") || "/";
    if (target !== route && canonicalRoutes.has(target)) inboundLinks.get(target).add(route);
  }

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const schema = JSON.parse(match[1]);
    assert.doesNotMatch(JSON.stringify(schema), /AggregateRating|reviewCount|ratingValue|"review"/i, `${route} must not expose imported ratings in schema`);
    parsedSchemaBlocks += 1;
  }
}

for (const route of indexableRoutes) {
  if (route !== "/") assert.ok(inboundLinks.get(route)?.size, `${route} is an orphaned indexable page`);
}

for (const restaurant of restaurants) {
  const ready = isRestaurantSearchReady(restaurant);
  if (ready) {
    assert.ok(publisherContentWordCount(restaurant) >= 200, `${restaurant.name} has insufficient authored content`);
    assert.ok(["primary", "substantial"].includes(restaurant.relevance.classification), `${restaurant.name} has weak relevance`);
    assert.equal(restaurant.menu.status, "verified_current", `${restaurant.name} needs a current verified menu`);
  }
  const html = await fs.readFile(routeFile(restaurant.canonicalPath), "utf8");
  const publisherStart = html.indexOf("data-publisher-content");
  const publisherEnd = html.indexOf('<aside class="listing-sidebar"', publisherStart);
  assert.ok(publisherStart >= 0 && publisherEnd > publisherStart, `${restaurant.name} needs a marked publisher-content region`);
  if (ready) assert.ok(wordCount(visibleText(html.slice(publisherStart, publisherEnd))) >= 200, `${restaurant.name} renders too little publisher content`);
}

assert.equal(new Set(restaurants.map((restaurant) => normalized(restaurant.content.shortDescription))).size, restaurants.length, "short descriptions must be unique across every listing");
assert.equal(new Set(restaurants.map((restaurant) => normalized(restaurant.content.editorialDescription))).size, restaurants.length, "editorial descriptions must be unique across every listing");

const readyRestaurants = restaurants.filter((restaurant) => isRestaurantSearchReady(restaurant));
let maximumEditorialJaccard = 0;
for (let left = 0; left < readyRestaurants.length; left += 1) {
  const leftGrams = fiveGrams(readyRestaurants[left].content.editorialDescription);
  for (let right = left + 1; right < readyRestaurants.length; right += 1) {
    const rightGrams = fiveGrams(readyRestaurants[right].content.editorialDescription);
    const intersection = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
    const union = new Set([...leftGrams, ...rightGrams]).size;
    maximumEditorialJaccard = Math.max(maximumEditorialJaccard, union ? intersection / union : 0);
  }
}
assert.ok(maximumEditorialJaccard < 0.15, `editorial similarity exceeds the 0.15 ceiling: ${maximumEditorialJaccard.toFixed(4)}`);

const notFound = await fs.readFile(path.join(output, "404.html"), "utf8");
assert.match(notFound, /name=["']robots["'][^>]*content=["']noindex/i);
assert.doesNotMatch(notFound, /rel=["']canonical["']/i);

console.log(JSON.stringify({
  canonicalPagesAudited: canonicalRoutes.size,
  indexablePages: indexableRoutes.size,
  noindexCanonicalPages: canonicalRoutes.size - indexableRoutes.size,
  indexableRestaurants: readyRestaurantRoutes.length,
  indexableCities: readyCityRoutes.length,
  indexableProvinces: readyProvinceRoutes.length,
  indexableStyles: readyStyleRoutes.length,
  indexableFeatures: readyFeatureRoutes.length,
  validJsonLdBlocks: parsedSchemaBlocks,
  maximumEditorialFiveGramJaccard: Number(maximumEditorialJaccard.toFixed(4)),
}, null, 2));
