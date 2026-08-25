import type { Metadata } from "next";

export const SITE_NAME = "Ramen Scout Canada";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://ramenscout.ca").replace(/\/$/, "");
export const STATIC_INDEXING_ENABLED = process.env.NEXT_PUBLIC_ALLOW_STATIC_INDEXING === "true";
export const FULL_CONTENT_INDEXING_ENABLED = process.env.NEXT_PUBLIC_ALLOW_ALL_CONTENT_INDEXING === "true";
export const INDEXING_ENABLED = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";
export const PUBLISHER = {
  name: "Nocturnal Devs",
  url: "https://www.nocturnaldevs.com/",
  email: "nocturnaldevs@gmail.com",
  phone: "+1-437-366-2920",
  phoneDisplay: "+1 (437) 366-2920",
  address: {
    street: "419 Markham Road",
    city: "Toronto",
    region: "Ontario",
    regionCode: "ON",
    postalCode: "M1J 3E1",
    country: "Canada",
    countryCode: "CA",
  },
} as const;

export function absoluteUrl(path = "/") {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function pageRobots(eligible = true): Metadata["robots"] {
  const index = STATIC_INDEXING_ENABLED && eligible;
  return { index, follow: true, googleBot: { index, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } };
}

export function buildPageMetadata({ title, description, path, indexable = true }: { title: string; description: string; path: string; indexable?: boolean }): Metadata {
  const url = absoluteUrl(path);
  const socialTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const socialImage = { url: absoluteUrl("/og.png"), width: 1200, height: 630, alt: "Ramen Scout Canada — Find ramen near you" };
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: pageRobots(indexable),
    openGraph: { type: "website", locale: "en_CA", siteName: SITE_NAME, title: socialTitle, description, url, images: [socialImage] },
    twitter: { card: "summary_large_image", title: socialTitle, description, images: [socialImage.url] },
  };
}

export const CORE_STATIC_INDEXABLE_PATHS = [
  "/",
  "/locations",
  "/about",
  "/methodology",
  "/editorial-standards",
];

export const ALL_STATIC_CONTENT_PATHS = [
  ...CORE_STATIC_INDEXABLE_PATHS,
  "/corrections",
  "/contact",
  "/privacy",
  "/accessibility",
  "/terms",
];
