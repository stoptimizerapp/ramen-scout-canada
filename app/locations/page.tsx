import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { summary } from "@/lib/directory";
import { buildPageMetadata } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({ title: "Ramen restaurants by Canadian location", description: `Browse ramen restaurants across ${summary.provinceCount} Canadian provinces and territories and ${summary.cityCount} cities.`, path: "/locations" });

export default function LocationsPage() {
  return <main className="page-shell"><Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Locations" }]} /><header className="page-hero"><p className="eyebrow"><span /> Canada-wide directory</p><h1>Browse ramen by location.</h1><p>{summary.restaurantCount} restaurants across {summary.cityCount} cities, organized into a simple Canada → province → city hierarchy.</p></header><section className="province-grid" aria-label="Provinces and territories">{summary.provinces.map((province) => <article className="province-card" key={province.code}><div><span>{province.code}</span><h2><Link href={`/locations/${province.slug}`}>{province.name}</Link></h2><p>{province.count} restaurants · {province.cities.length} {province.cities.length === 1 ? "city" : "cities"}</p></div><ul>{province.cities.slice(0, 6).map((city) => <li key={city.slug}><Link href={`/locations/${province.slug}/${city.slug}`}>{city.name}</Link><span>{city.count}</span></li>)}</ul>{province.cities.length > 6 ? <Link className="text-link" href={`/locations/${province.slug}`}>See all {province.cities.length} cities →</Link> : null}</article>)}</section><aside className="editorial-note"><h2>Why sparse locations stay noindexed</h2><p>A city page needs enough reviewed restaurants and useful comparison data before it should compete in search. One-listing hubs remain available for browsing, but are kept out of Google until they provide genuine standalone value.</p></aside></main>;
}
