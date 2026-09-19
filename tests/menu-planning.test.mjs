import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { comparableItems, pricedItems, comparisonRows, diverseMenuSelections } from "../lib/menu-planning.ts";
import { isRestaurantSearchReady } from "../lib/search-readiness.js";
const restaurants = JSON.parse(fs.readFileSync(new URL("../data/restaurants.json", import.meta.url)));
test("menu comparisons never price missing values as zero or borrow a different style", () => {
  assert.deepEqual(pricedItems([{ name: "Unknown" }, { name: "Invalid", price: 0 }, { name: "Real", price: 17 }]).map((i) => i.name), ["Real"]);
  for (const style of ["miso", "shoyu", "tonkotsu", "tsukemen"]) {
    for (const { item } of comparisonRows(restaurants, style)) assert.ok([...(item.brothStyle || []), ...(item.tare || []), ...(item.servingStyle || [])].includes(style));
  }
  assert.equal(comparableItems({ menu: { status: "available_unverified", items: [{ name: "Unverified" }] } }).length, 0);
});
test("homepage selections spread coverage rather than repeating one chain", () => {
  const selected = diverseMenuSelections(restaurants);
  assert.equal(selected.length, 6);
  assert.equal(new Set(selected.map((r) => `${r.provinceSlug}/${r.citySlug}`)).size, 6);
  assert.equal(new Set(selected.map((r) => (r.brandName || r.name.split("(")[0]).toLowerCase().trim())).size, 6);
});
test("September source corrections retain conservative dietary and indexing decisions", () => {
  const shiki = restaurants.find((r) => r.id === "ramen_ca_1d358958d30659cd7b34");
  assert.equal(shiki.menu.items.length, 9);
  assert.equal(isRestaurantSearchReady(shiki), false, "a menu refresh alone must not override the unresolved evidence gate");
  const crafty = restaurants.find((r) => r.id === "ramen_ca_fff7ee5d989f8ea60fae");
  assert.equal(crafty.noodles.status, "restaurant_claimed_unspecified", "daily house-made does not prove on-site production");
  for (const r of restaurants.filter((r) => /Sansotei/.test(r.name))) {
    assert.notEqual(r.menu.url, "https://www.sansotei.com/menu", "replace the observed soft-404");
    assert.equal(isRestaurantSearchReady(r), false, "brand-menu link alone cannot promote a branch");
  }
  for (const r of restaurants.filter((r) => /DANBO|Danbo/.test(r.name))) {
    assert.equal(r.vegan.bowlCount, 4);
    assert.equal(r.reservations.status, "not_offered_confirmed");
    assert.equal(r.menu.items.length, 8);
  }
});
