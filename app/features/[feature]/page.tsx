import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RestaurantList } from "@/components/RestaurantList";
import { featureDefinitions, isRestaurantIndexable, restaurantsForFeature, type FeatureSlug } from "@/lib/directory";
import { buildPageMetadata } from "@/lib/site";

const featureSlugs = Object.keys(featureDefinitions) as FeatureSlug[];
export function generateStaticParams() { return featureSlugs.map((feature) => ({ feature })); }

export async function generateMetadata({ params }: { params: Promise<{ feature: string }> }): Promise<Metadata> {
  const { feature } = await params;
  if (!featureSlugs.includes(feature as FeatureSlug)) return {};
  const definition = featureDefinitions[feature as FeatureSlug];
  const entries = restaurantsForFeature(feature as FeatureSlug);
  const eligible = entries.filter(isRestaurantIndexable).length >= 8;
  return buildPageMetadata({ title: `${definition.label} in Canada`, description: `${definition.intro} Browse ${entries.length} source-backed Canadian restaurant matches.`, path: `/features/${feature}`, indexable: eligible });
}

export default async function FeaturePage({ params }: { params: Promise<{ feature: string }> }) {
  const { feature } = await params;
  if (!featureSlugs.includes(feature as FeatureSlug)) notFound();
  const definition = featureDefinitions[feature as FeatureSlug];
  const entries = restaurantsForFeature(feature as FeatureSlug);
  return <main className="page-shell"><Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Features", href: "/methodology#filters" }, { label: definition.label }]} /><header className="page-hero"><p className="eyebrow"><span /> Source-backed feature</p><h1>{definition.label}.</h1><p>{definition.intro} The directory currently has {entries.length} explicit matches.</p></header><section className="content-section"><div className="result-heading"><h2>{entries.length} matching restaurants</h2><p>Listings with unknown status are intentionally left out.</p></div><RestaurantList restaurants={entries} /></section></main>;
}
