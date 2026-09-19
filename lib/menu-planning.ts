import type { MenuItem, Restaurant } from "./types";
import { usableMenuItems } from "./content-publication.js";

export function comparableItems(restaurant: Restaurant, filter?: string) {
  if (restaurant.menu.status !== "verified_current") return [];
  return usableMenuItems(restaurant).filter((item: MenuItem) => {
    if (!filter) return true;
    if (filter === "vegan") return item.dietary?.includes("vegan") || restaurant.vegan.itemNames.includes(item.name);
    if (["tonkotsu", "shoyu", "miso", "tsukemen"].includes(filter)) {
      return [...(item.brothStyle || []), ...(item.tare || []), ...(item.servingStyle || [])].includes(filter);
    }
    return true;
  });
}

export function pricedItems(items: MenuItem[]) {
  return items.filter((item): item is MenuItem & { price: number } => typeof item.price === "number" && Number.isFinite(item.price) && item.price > 0)
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

export function comparisonRows(restaurants: Restaurant[], filter?: string) {
  return restaurants.flatMap((restaurant) => {
    const items = comparableItems(restaurant, filter);
    const item = pricedItems(items)[0] || items[0];
    return item ? [{ restaurant, item }] : [];
  }).sort((a, b) => a.restaurant.name.localeCompare(b.restaurant.name) || a.restaurant.location.street.localeCompare(b.restaurant.location.street));
}

// Diversity is for browsing, not a claim about taste, popularity or quality.
export function diverseMenuSelections(restaurants: Restaurant[], limit = 6) {
  const brands = new Set<string>();
  const cities = new Set<string>();
  return [...restaurants].sort((a, b) => (b.menu.verifiedAt || "").localeCompare(a.menu.verifiedAt || "") || a.name.localeCompare(b.name)).filter((restaurant) => {
    if (!comparableItems(restaurant).length || !pricedItems(restaurant.menu.items).length) return false;
    const brand = (restaurant.brandName || restaurant.name.split("(")[0]).toLowerCase().trim();
    const city = `${restaurant.provinceSlug}/${restaurant.citySlug}`;
    if (brands.has(brand) || cities.has(city) || cities.size >= limit) return false;
    brands.add(brand); cities.add(city);
    return true;
  });
}
