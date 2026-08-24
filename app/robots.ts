import type { MetadataRoute } from "next";
import { absoluteUrl, INDEXING_ENABLED } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!INDEXING_ENABLED) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/search", "/*?*sort=", "/*?*filter=", "/*?*q="] },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
