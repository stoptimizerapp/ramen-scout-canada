import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MenuComparison } from "@/components/MenuComparison";
import { SiteLink as Link } from "@/components/SiteLink";
import { RestaurantList } from "@/components/RestaurantList";
import { featureDefinitions, isFacetSearchReady, restaurantsForFeature, type FeatureSlug } from "@/lib/directory";
import { buildPageMetadata } from "@/lib/site";

const featureSlugs = Object.keys(featureDefinitions) as FeatureSlug[];
export function generateStaticParams() { return featureSlugs.map((feature) => ({ feature })); }

export async function generateMetadata({ params }: { params: Promise<{ feature: string }> }): Promise<Metadata> {
  const { feature } = await params;
  if (!featureSlugs.includes(feature as FeatureSlug)) return {};
  const definition = featureDefinitions[feature as FeatureSlug];
  const entries = restaurantsForFeature(feature as FeatureSlug);
  return buildPageMetadata({ title: `${definition.label} in Canada`, description: `${definition.intro} Browse ${entries.length} source-backed Canadian restaurant matches.`, path: `/features/${feature}`, indexable: isFacetSearchReady(entries) });
}

export default async function FeaturePage({ params }: { params: Promise<{ feature: string }> }) {
  const { feature } = await params;
  if (!featureSlugs.includes(feature as FeatureSlug)) notFound();
  const definition = featureDefinitions[feature as FeatureSlug];
  const entries = restaurantsForFeature(feature as FeatureSlug);
  return <main className="page-shell"><Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Features", href: "/methodology#filters" }, { label: definition.label }]} /><header className="page-hero"><p className="eyebrow"><span /> Source-backed feature</p><h1>{definition.label}.</h1><p>{definition.intro} The directory currently has {entries.length} explicit matches.</p></header><aside className="editorial-note"><h2>What this filter does—and does not—tell you</h2><p>{feature === "vegan" ? "An explicitly vegan bowl is stronger evidence than a tofu topping or a general vegetarian label. Some restaurants require egg-free noodle substitutions; do not assume the default order qualifies. Vegan wording is not an allergy or shared-equipment guarantee." : feature === "late-night" ? "Check the exact day: a restaurant may close late only on Friday or Saturday. A listed 11 p.m. close is not a verified last-order time, current queue estimate or promise of a table. Compare the weekly schedule and call if you would arrive near closing." : feature === "reservations" ? "Reported reservation acceptance does not guarantee availability, a booking channel or acceptance of every party size. A waitlist is not an advance reservation. Use the branch’s booking instructions and check group-deposit or cancellation terms directly." : "On-site noodle making is a production claim, not a taste score. It is narrower than house-made, which may mean a separate company kitchen. Noodle thickness, ingredients and firmness are separate questions and can matter even when production is confirmed."}</p><Link href="/guides/choosing-ramen">Read the menu comparison guide →</Link></aside><MenuComparison restaurants={entries} title="Compare a documented bowl and the visit requirements" filter={feature} /><section className="content-section"><div className="result-heading"><h2>{entries.length} matching restaurants</h2><p>Listings with unknown status are intentionally left out.</p></div><RestaurantList restaurants={entries} /></section></main>;
}
