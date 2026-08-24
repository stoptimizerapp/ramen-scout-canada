import type { MetadataRoute } from "next";
import { directoryRestaurants, featureDefinitions, getProvinceRestaurants, isCityIndexable, isRestaurantIndexable, restaurantsForFeature, restaurantsForStyle, styleDefinitions, summary, type FeatureSlug, type StyleSlug } from "@/lib/directory";
import { absoluteUrl, INDEXING_ENABLED, STATIC_INDEXABLE_PATHS } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEXING_ENABLED) return [];
  const changed = new Date(summary.generatedAt);
  const staticPages = STATIC_INDEXABLE_PATHS.map((path) => ({ url: absoluteUrl(path), lastModified: changed, changeFrequency: path === "/" ? "weekly" as const : "monthly" as const, priority: path === "/" ? 1 : path === "/locations" ? .8 : .5 }));
  const restaurantPages = directoryRestaurants.filter(isRestaurantIndexable).map((restaurant) => ({ url: absoluteUrl(restaurant.canonicalPath), lastModified: new Date(restaurant.refreshedAt), changeFrequency: "monthly" as const, priority: .7 }));
  const cityPages = summary.provinces.flatMap((province) => province.cities.flatMap((city) => {
    const entries = directoryRestaurants.filter((restaurant) => restaurant.provinceSlug === province.slug && restaurant.citySlug === city.slug);
    return isCityIndexable(entries) ? [{ url: absoluteUrl(`/locations/${province.slug}/${city.slug}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .75 }] : [];
  }));
  const provincePages = summary.provinces.flatMap((province) => {
    const entries = getProvinceRestaurants(province.slug).filter(isRestaurantIndexable);
    const cityCount = new Set(entries.map((restaurant) => restaurant.location.city)).size;
    return entries.length >= 8 && cityCount >= 2 ? [{ url: absoluteUrl(`/locations/${province.slug}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .75 }] : [];
  });
  const stylePages = (Object.keys(styleDefinitions) as StyleSlug[]).flatMap((style) => restaurantsForStyle(style).filter(isRestaurantIndexable).length >= 8 ? [{ url: absoluteUrl(`/styles/${style}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .7 }] : []);
  const featurePages = (Object.keys(featureDefinitions) as FeatureSlug[]).flatMap((feature) => restaurantsForFeature(feature).filter(isRestaurantIndexable).length >= 8 ? [{ url: absoluteUrl(`/features/${feature}`), lastModified: changed, changeFrequency: "monthly" as const, priority: .7 }] : []);
  return [...staticPages, ...provincePages, ...cityPages, ...stylePages, ...featurePages, ...restaurantPages];
}
