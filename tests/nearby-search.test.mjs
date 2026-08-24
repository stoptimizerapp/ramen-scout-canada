import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { rankByDistance, rankByDistanceWithFallback, rankNearestGeocoded } from "../lib/geo.ts";
import { getSearchResults, isExactCitySearch } from "../lib/types.ts";

const searchIndex = JSON.parse(await readFile(new URL("../public/data/search-index.json", import.meta.url), "utf8"));
const ajaxOrigin = { latitude: 43.8509, longitude: -79.0204 };

test("Ajax has two current listings and nearby mode crosses city boundaries", () => {
  const ajaxListings = searchIndex.filter((record) => record.city === "Ajax" && record.provinceCode === "ON");
  assert.equal(ajaxListings.length, 2);
  assert.deepEqual(
    ajaxListings.map((record) => record.name).sort(),
    ["Ajisen Ramen (Ajax)", "Umi Sushi"],
  );

  const nearest = rankNearestGeocoded(searchIndex, ajaxOrigin, 6);
  assert.equal(nearest.length, 6);
  assert.deepEqual(
    nearest.filter(({ item }) => item.city === "Ajax").map(({ item }) => item.name).sort(),
    ["Ajisen Ramen (Ajax)", "Umi Sushi"],
  );
  assert.ok(new Set(nearest.map(({ item }) => item.city)).size > 1, "homepage results should not stop at the Ajax boundary");
  assert.ok(nearest.some(({ item }) => item.city === "Pickering"));
  assert.ok(nearest.some(({ item }) => item.city === "Whitby"));
});

test("a sparse exact-city search keeps Ajax and adds the closest eligible restaurants", () => {
  assert.equal(isExactCitySearch(searchIndex, "Ajax"), true);
  assert.equal(isExactCitySearch(searchIndex, "Ajax ON"), true);
  const exact = getSearchResults(searchIndex, "Ajax", []);
  const expanded = rankByDistanceWithFallback(exact, getSearchResults(searchIndex, "", []), ajaxOrigin, 6);

  assert.equal(expanded.expanded, true);
  assert.equal(expanded.exactCount, 2);
  assert.equal(expanded.results.length, 6);
  assert.ok(expanded.results.some(({ item, isExactMatch }) => item.id === exact[0].id && isExactMatch));
  assert.ok(expanded.results.some(({ item, isExactMatch }) => item.city !== "Ajax" && !isExactMatch));
  assert.deepEqual(
    expanded.results.map(({ distance }) => distance),
    [...expanded.results.map(({ distance }) => distance)].sort((left, right) => left - right),
    "the combined exact and fallback set should still be ordered by distance",
  );
});

test("city fallback retains confirmed filters and does not broaden restaurant-name searches", () => {
  const filteredExact = getSearchResults(searchIndex, "Ajax", ["miso"]);
  const filteredEligible = getSearchResults(searchIndex, "", ["miso"]);
  const filteredExpanded = rankByDistanceWithFallback(filteredExact, filteredEligible, ajaxOrigin, 6);
  assert.ok(filteredExpanded.results.length > 1);
  assert.ok(filteredExpanded.results.every(({ item }) => item.miso === "yes"));

  const restaurantQuery = "Ajisen Ramen (Ajax)";
  const restaurantMatches = getSearchResults(searchIndex, restaurantQuery, []);
  assert.equal(restaurantMatches.length, 1);
  assert.equal(isExactCitySearch(searchIndex, restaurantQuery), false);
  assert.equal(rankByDistance(restaurantMatches, ajaxOrigin).length, 1, "explicit restaurant searches stay exact");
});
