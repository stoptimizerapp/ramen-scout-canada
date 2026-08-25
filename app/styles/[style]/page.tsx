import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RestaurantList } from "@/components/RestaurantList";
import { isFacetSearchReady, restaurantsForStyle, styleDefinitions, type StyleSlug } from "@/lib/directory";
import { buildPageMetadata } from "@/lib/site";

const styleSlugs = Object.keys(styleDefinitions) as StyleSlug[];
export function generateStaticParams() { return styleSlugs.map((style) => ({ style })); }

export async function generateMetadata({ params }: { params: Promise<{ style: string }> }): Promise<Metadata> {
  const { style } = await params;
  if (!styleSlugs.includes(style as StyleSlug)) return {};
  const definition = styleDefinitions[style as StyleSlug];
  const entries = restaurantsForStyle(style as StyleSlug);
  return buildPageMetadata({ title: `${definition.label} in Canada`, description: `Browse ${entries.length} Canadian restaurants with explicit ${style} menu evidence, verification dates and practical visit details.`, path: `/styles/${style}`, indexable: isFacetSearchReady(entries) });
}

export default async function StylePage({ params }: { params: Promise<{ style: string }> }) {
  const { style } = await params;
  if (!styleSlugs.includes(style as StyleSlug)) notFound();
  const definition = styleDefinitions[style as StyleSlug];
  const entries = restaurantsForStyle(style as StyleSlug);
  return <main className="page-shell"><Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Ramen styles", href: "/methodology#styles" }, { label: definition.label }]} /><header className="page-hero"><p className="eyebrow"><span /> Confirmed menu style</p><h1>{definition.label} in Canada.</h1><p>{definition.intro} We currently have {entries.length} matching restaurants; every card links to the underlying menu status and check date.</p></header><section className="content-section"><div className="result-heading"><h2>{entries.length} confirmed {style} options</h2><p>This page excludes unknowns and inferred matches.</p></div><RestaurantList restaurants={entries} /></section></main>;
}
