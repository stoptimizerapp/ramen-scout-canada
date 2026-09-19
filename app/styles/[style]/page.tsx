import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MenuComparison } from "@/components/MenuComparison";
import { SiteLink as Link } from "@/components/SiteLink";
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
  return <main className="page-shell"><Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Ramen styles", href: "/methodology#styles" }, { label: definition.label }]} /><header className="page-hero"><p className="eyebrow"><span /> Confirmed menu style</p><h1>{definition.label} in Canada.</h1><p>{definition.intro} We currently have {entries.length} matching restaurants; every card links to the underlying menu status and check date.</p></header><aside className="editorial-note"><h2>Read the whole bowl description</h2><p>{style === "tonkotsu" ? "Tonkotsu identifies pork-bone broth; it is not the same word as tonkatsu, the breaded pork cutlet. A chicken topping does not change the soup underneath. Compare the stock first, then noodle style, toppings and paid upgrades." : style === "shoyu" ? "Shoyu describes soy-based seasoning, not an animal-free broth. Our menu examples include only items explicitly tagged shoyu; check each named bowl for pork, chicken or seafood stock rather than treating the style label as a dietary claim." : style === "miso" ? "Miso is a seasoning direction, not a guarantee of vegetarian stock. A menu may offer both pork-based and plant-based miso bowls. Compare the complete recipe and noodle ingredients, then check whether egg, butter or meat toppings are included." : "Dipping noodles are a different serving format from soup ramen or brothless mazemen. Menus may specify hot or cold noodles and a separate cooking time. Prices for soup ramen at the same restaurant are not necessarily prices for tsukemen."}</p><Link href="/guides/choosing-ramen">See real menu examples and price calculations →</Link></aside><MenuComparison restaurants={entries} title={`Named ${style} bowls to compare`} filter={style} /><section className="content-section"><div className="result-heading"><h2>{entries.length} confirmed {style} options</h2><p>This page excludes unknowns and inferred matches.</p></div><RestaurantList restaurants={entries} /></section></main>;
}
