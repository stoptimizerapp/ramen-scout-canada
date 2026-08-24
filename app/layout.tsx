import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { INDEXING_ENABLED, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Find ramen near you`, template: `%s | ${SITE_NAME}` },
  description: "Compare ramen restaurants across Canada by location, menu style, price, dietary evidence, hours and reservations.",
  applicationName: SITE_NAME,
  category: "food and dining",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFF8EA", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-CA"><body>{!INDEXING_ENABLED ? <aside className="preview-notice" aria-label="Preview status"><strong>Research preview</strong><span>Listings remain noindexed and ad-free until their final human review is complete.</span></aside> : null}<SiteHeader /><div id="main-content" tabIndex={-1}>{children}</div><SiteFooter /></body></html>;
}
