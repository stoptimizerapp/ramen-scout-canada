import type { MetadataRoute } from "next";
import { absoluteUrl, STATIC_INDEXING_ENABLED } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!STATIC_INDEXING_ENABLED) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: [
      // Crawlers must be able to read noindex on search and query variants.
      { userAgent: "*", allow: "/" },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
