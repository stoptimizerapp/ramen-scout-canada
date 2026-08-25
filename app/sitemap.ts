import type { MetadataRoute } from "next";
import { directoryRestaurants, featureDefinitions, getProvinceRestaurants, isCitySearchReady, isFacetSearchReady, isProvinceSearchReady, isRestaurantSearchReady, restaurantsForFeature, restaurantsForStyle, styleDefinitions, summary, type FeatureSlug, type StyleSlug } from "@/lib/directory";
import { absoluteUrl, ALL_STATIC_CONTENT_PATHS, STATIC_INDEXING_ENABLED } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!STATIC_INDEXING_ENABLED) return [];
  const changed = new Date(summary.generatedAt);
  const staticPages = ALL_STATIC_CONTENT_PATHS.map((path) => ({ url: absoluteUrl(path), lastModified: changed, changeFrequency: path === "/" ? "weekly" as const : "monthly" as const, priority: path === "/" ? 1 : path === "/locations" ? .8 : .5 }));
  const restaurantPages = directoryRestaurants.filter((restaurant) => isRestaurantSearchReady(restaurant)).map((restaurant) => ({ url: absoluteUrl(restaurant.canonicalPath), lastModified: new Date(restaurant.refreshedAt), changeFrequency: "monthly" as const, priority: .7 }));
  const cityPages = summary.provinces.flatMap((province) => province.cities.flatMap((city) => {
    const entries = directoryRestaurants.filter((restaurant) => restaurant.provinceSlug === province.slug && restaurant.citySlug === city.slug);
    return isCitySearchReady(entries) ? [{ url: absoluteUrl(`/locations/${province.slug}/${city.slug}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .75 }] : [];
  }));
  const provincePages = summary.provinces.flatMap((province) => {
    const entries = getProvinceRestaurants(province.slug);
    return isProvinceSearchReady(entries) ? [{ url: absoluteUrl(`/locations/${province.slug}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .75 }] : [];
  });
  const stylePages = (Object.keys(styleDefinitions) as StyleSlug[]).flatMap((style) => isFacetSearchReady(restaurantsForStyle(style)) ? [{ url: absoluteUrl(`/styles/${style}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .7 }] : []);
  const featurePages = (Object.keys(featureDefinitions) as FeatureSlug[]).flatMap((feature) => isFacetSearchReady(restaurantsForFeature(feature)) ? [{ url: absoluteUrl(`/features/${feature}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .7 }] : []);
  return [...staticPages, ...provincePages, ...cityPages, ...stylePages, ...featurePages, ...restaurantPages];
}
