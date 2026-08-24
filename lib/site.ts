import type { Metadata } from "next";

export const SITE_NAME = "Ramen Scout Canada";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://ramenscout.ca").replace(/\/$/, "");
export const INDEXING_ENABLED = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";

export function absoluteUrl(path = "/") {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function pageRobots(eligible = true): Metadata["robots"] {
  const index = INDEXING_ENABLED && eligible;
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

export const STATIC_INDEXABLE_PATHS = [
  "/",
  "/locations",
  "/about",
  "/methodology",
  "/editorial-standards",
  "/corrections",
  "/contact",
  "/privacy",
  "/accessibility",
  "/terms",
];
