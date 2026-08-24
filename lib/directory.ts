import restaurantJson from "@/data/restaurants.json";
import summaryJson from "@/data/directory-summary.json";
import { INDEXING_ENABLED } from "./site";
import type { DirectorySummary, Restaurant } from "./types";

export const restaurants = restaurantJson as Restaurant[];
export const summary = summaryJson as DirectorySummary;

export function isRestaurantIndexable(restaurant: Restaurant) {
  const hasOfficialEvidence = restaurant.evidence.some((item) => item.url && ["official_menu", "official_site"].includes(item.sourceType || ""));
  const nextReviewDue = Date.parse(restaurant.nextReviewDue || "");
  return restaurant.publication.status === "published"
    && restaurant.publication.robots.startsWith("index")
    && restaurant.publication.adsAllowed === "yes"
    && restaurant.publication.gateStatus === "pass"
    && restaurant.publication.failCodes.length === 0
    && restaurant.publication.qualityScore >= 90
    && restaurant.publication.verifiedDecisionFieldCount >= 6
    && Boolean(restaurant.publication.humanReviewedAt)
    && Object.values(restaurant.publication.gates).every((value) => value === "yes")
    && ["primary", "substantial"].includes(restaurant.relevance.classification)
    && restaurant.menu.status === "verified_current"
    && restaurant.evidence.length >= 2
    && hasOfficialEvidence
    && Number.isFinite(nextReviewDue)
    && nextReviewDue >= Date.now();
}

export const directoryRestaurants = INDEXING_ENABLED ? restaurants.filter(isRestaurantIndexable) : restaurants;
export const restaurantByPath = new Map(directoryRestaurants.map((restaurant) => [restaurant.canonicalPath, restaurant]));
export const restaurantById = new Map(directoryRestaurants.map((restaurant) => [restaurant.id, restaurant]));

export function getRestaurant(province: string, city: string, slug: string) {
  return restaurantByPath.get(`/restaurants/${province}/${city}/${slug}`);
}

export function getProvince(provinceSlug: string) {
  return summary.provinces.find((province) => province.slug === provinceSlug);
}

export function getCity(provinceSlug: string, citySlug: string) {
  const province = getProvince(provinceSlug);
  const city = province?.cities.find((item) => item.slug === citySlug);
  if (!province || !city) return null;
  const entries = directoryRestaurants.filter((restaurant) => restaurant.provinceSlug === provinceSlug && restaurant.citySlug === citySlug);
  return { province, city, restaurants: entries };
}

export function getProvinceRestaurants(provinceSlug: string) {
  return directoryRestaurants.filter((restaurant) => restaurant.provinceSlug === provinceSlug);
}

export function isCityIndexable(entries: Restaurant[]) {
  const eligible = entries.filter(isRestaurantIndexable);
  return eligible.length >= 5
    && eligible.filter((restaurant) => restaurant.menu.status === "verified_current").length >= 3;
}

export const styleDefinitions = {
  tonkotsu: { label: "Tonkotsu ramen", intro: "Tonkotsu is a pork-bone broth style known for body and richness. These restaurants explicitly name tonkotsu on a current menu source." },
  shoyu: { label: "Shoyu ramen", intro: "Shoyu ramen is seasoned with soy-based tare. Every match below is based on explicit menu wording rather than a guess from the restaurant’s cuisine." },
  miso: { label: "Miso ramen", intro: "Miso ramen uses fermented soybean paste as a seasoning base, creating savoury depth that can range from gentle to robust." },
  tsukemen: { label: "Tsukemen", intro: "Tsukemen serves noodles separately from a concentrated dipping broth. These menus explicitly identify the style." },
} as const;

export type StyleSlug = keyof typeof styleDefinitions;

export function restaurantsForStyle(style: StyleSlug) {
  return directoryRestaurants.filter((restaurant) => restaurant.taxonomy[style] === "yes");
}

export const featureDefinitions = {
  "late-night": { label: "Late-night ramen", intro: "These restaurants list service until at least 11 p.m. on one or more days. Always recheck same-day hours before travelling.", matches: (restaurant: Restaurant) => restaurant.hours.lateNightStatus === "yes" },
  reservations: { label: "Ramen restaurants taking reservations", intro: "These restaurants currently report reservations as accepted or required. Booking policies can vary by party size and service period.", matches: (restaurant: Restaurant) => ["accepted", "required"].includes(restaurant.reservations.status) },
  vegan: { label: "Ramen with a confirmed vegan bowl", intro: "A vegan claim is not enough on its own: this list is limited to restaurants where a complete vegan ramen-family bowl was explicitly found.", matches: (restaurant: Restaurant) => ["one_complete_bowl", "multiple_complete_bowls"].includes(restaurant.vegan.status) },
  "house-made-noodles": { label: "Ramen with noodles made on site", intro: "These restaurants explicitly state that noodles are made on site. Broader house-made claims without a stated production location are not included.", matches: (restaurant: Restaurant) => restaurant.noodles.status === "made_on_site" },
} as const;

export type FeatureSlug = keyof typeof featureDefinitions;

export function restaurantsForFeature(feature: FeatureSlug) {
  return directoryRestaurants.filter(featureDefinitions[feature].matches);
}

export function cityFacts(entries: Restaurant[]) {
  const knownPrices = entries.filter((restaurant) => restaurant.prices.min !== null);
  const mins = knownPrices.map((restaurant) => restaurant.prices.min as number);
  const maxes = knownPrices.map((restaurant) => restaurant.prices.max ?? restaurant.prices.min as number);
  return {
    count: entries.length,
    verifiedMenus: entries.filter((restaurant) => restaurant.menu.status === "verified_current").length,
    pricedMenus: knownPrices.length,
    lateNight: entries.filter((restaurant) => restaurant.hours.lateNightStatus === "yes").length,
    reservations: entries.filter((restaurant) => ["accepted", "required"].includes(restaurant.reservations.status)).length,
    tonkotsu: entries.filter((restaurant) => restaurant.taxonomy.tonkotsu === "yes").length,
    shoyu: entries.filter((restaurant) => restaurant.taxonomy.shoyu === "yes").length,
    miso: entries.filter((restaurant) => restaurant.taxonomy.miso === "yes").length,
    tsukemen: entries.filter((restaurant) => restaurant.taxonomy.tsukemen === "yes").length,
    priceMin: mins.length ? Math.min(...mins) : null,
    priceMax: maxes.length ? Math.max(...maxes) : null,
    neighbourhoods: [...new Set(entries.map((restaurant) => restaurant.location.neighbourhood).filter(Boolean))].sort(),
  };
}
