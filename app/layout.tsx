import type { Metadata, Viewport } from "next";
import { FirebaseAnalytics } from "@/components/FirebaseAnalytics";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PUBLISHER, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Find ramen near you`, template: `%s | ${SITE_NAME}` },
  description: "Compare ramen restaurants across Canada by location, menu style, price, dietary evidence, hours and reservations.",
  applicationName: SITE_NAME,
  authors: [{ name: PUBLISHER.name, url: PUBLISHER.url }],
  creator: PUBLISHER.name,
  publisher: PUBLISHER.name,
  category: "food and dining",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFF8EA", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-CA"><body><SiteHeader /><div id="main-content" tabIndex={-1}>{children}</div><SiteFooter /><FirebaseAnalytics /></body></html>;
}
