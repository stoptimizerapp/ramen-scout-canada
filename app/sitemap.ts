import type { MetadataRoute } from "next";
import { directoryRestaurants, featureDefinitions, getProvinceRestaurants, isCityIndexable, isRestaurantIndexable, restaurantsForFeature, restaurantsForStyle, styleDefinitions, summary, type FeatureSlug, type StyleSlug } from "@/lib/directory";
import { absoluteUrl, ALL_STATIC_CONTENT_PATHS, CORE_STATIC_INDEXABLE_PATHS, FULL_CONTENT_INDEXING_ENABLED, STATIC_INDEXING_ENABLED } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!STATIC_INDEXING_ENABLED) return [];
  const changed = new Date(summary.generatedAt);
  const staticPaths = FULL_CONTENT_INDEXING_ENABLED ? ALL_STATIC_CONTENT_PATHS : CORE_STATIC_INDEXABLE_PATHS;
  const staticPages = staticPaths.map((path) => ({ url: absoluteUrl(path), lastModified: changed, changeFrequency: path === "/" ? "weekly" as const : "monthly" as const, priority: path === "/" ? 1 : path === "/locations" ? .8 : .5 }));
  const restaurantPages = directoryRestaurants.filter((restaurant) => FULL_CONTENT_INDEXING_ENABLED || isRestaurantIndexable(restaurant)).map((restaurant) => ({ url: absoluteUrl(restaurant.canonicalPath), lastModified: new Date(restaurant.refreshedAt), changeFrequency: "monthly" as const, priority: .7 }));
  const cityPages = summary.provinces.flatMap((province) => province.cities.flatMap((city) => {
    const entries = directoryRestaurants.filter((restaurant) => restaurant.provinceSlug === province.slug && restaurant.citySlug === city.slug);
    return FULL_CONTENT_INDEXING_ENABLED || isCityIndexable(entries) ? [{ url: absoluteUrl(`/locations/${province.slug}/${city.slug}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .75 }] : [];
  }));
  const provincePages = summary.provinces.flatMap((province) => {
    const entries = getProvinceRestaurants(province.slug).filter(isRestaurantIndexable);
    const cityCount = new Set(entries.map((restaurant) => restaurant.location.city)).size;
    return FULL_CONTENT_INDEXING_ENABLED || entries.length >= 8 && cityCount >= 2 ? [{ url: absoluteUrl(`/locations/${province.slug}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .75 }] : [];
  });
  const stylePages = (Object.keys(styleDefinitions) as StyleSlug[]).flatMap((style) => FULL_CONTENT_INDEXING_ENABLED || restaurantsForStyle(style).filter(isRestaurantIndexable).length >= 8 ? [{ url: absoluteUrl(`/styles/${style}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .7 }] : []);
  const featurePages = (Object.keys(featureDefinitions) as FeatureSlug[]).flatMap((feature) => FULL_CONTENT_INDEXING_ENABLED || restaurantsForFeature(feature).filter(isRestaurantIndexable).length >= 8 ? [{ url: absoluteUrl(`/features/${feature}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .7 }] : []);
  return [...staticPages, ...provincePages, ...cityPages, ...stylePages, ...featurePages, ...restaurantPages];
}
