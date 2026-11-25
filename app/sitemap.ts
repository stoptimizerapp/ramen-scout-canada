import type { MetadataRoute } from "next";
import { publicPath } from "@/lib/content-publication.js";
import { directoryRestaurants, featureDefinitions, getProvinceRestaurants, isCitySearchReady, isFacetSearchReady, isProvinceSearchReady, isRestaurantSearchReady, restaurantsForFeature, restaurantsForStyle, styleDefinitions, summary, type FeatureSlug, type StyleSlug } from "@/lib/directory";
import { absoluteUrl, ALL_STATIC_CONTENT_PATHS, STATIC_INDEXING_ENABLED } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!STATIC_INDEXING_ENABLED) return [];
  // Build times and restaurant source-check dates are not page modification dates.
  // Omit optional lastmod until a reliable per-page editorial change ledger exists.
  const staticPages = ALL_STATIC_CONTENT_PATHS.map((path) => ({ url: absoluteUrl(path), changeFrequency: path === "/" ? "weekly" as const : "monthly" as const, priority: path === "/" ? 1 : path === "/locations" ? .8 : .5 }));
  const restaurantPages = directoryRestaurants.filter((restaurant) => isRestaurantSearchReady(restaurant)).map((restaurant) => ({ url: absoluteUrl(restaurant.canonicalPath), changeFrequency: "monthly" as const, priority: .7 }));
  const cityPages = summary.provinces.flatMap((province) => province.cities.flatMap((city) => {
    const entries = directoryRestaurants.filter((restaurant) => restaurant.provinceSlug === province.slug && restaurant.citySlug === city.slug);
    return isCitySearchReady(entries) ? [{ url: absoluteUrl(`/locations/${province.slug}/${city.slug}`), changeFrequency: "monthly" as const, priority: .75 }] : [];
  }));
  const provincePages = summary.provinces.flatMap((province) => {
    const entries = getProvinceRestaurants(province.slug);
    return isProvinceSearchReady(entries) ? [{ url: absoluteUrl(`/locations/${province.slug}`), changeFrequency: "monthly" as const, priority: .75 }] : [];
  });
  const stylePages = (Object.keys(styleDefinitions) as StyleSlug[]).flatMap((style) => isFacetSearchReady(restaurantsForStyle(style)) ? [{ url: absoluteUrl(`/styles/${style}`), changeFrequency: "monthly" as const, priority: .7 }] : []);
  const featurePages = (Object.keys(featureDefinitions) as FeatureSlug[]).flatMap((feature) => isFacetSearchReady(restaurantsForFeature(feature)) ? [{ url: absoluteUrl(`/features/${feature}`), changeFrequency: "monthly" as const, priority: .7 }] : []);
  return [...staticPages, ...provincePages, ...cityPages, ...stylePages, ...featurePages, ...restaurantPages].filter(page => publicPath(new URL(page.url).pathname) === new URL(page.url).pathname);
}
