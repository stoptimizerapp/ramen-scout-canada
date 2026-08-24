import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RestaurantList } from "@/components/RestaurantList";
import { cityFacts, getCity, isCityIndexable, summary } from "@/lib/directory";
import { formatMoney } from "@/lib/format";
import { buildPageMetadata } from "@/lib/site";

export function generateStaticParams() { return summary.provinces.flatMap((province) => province.cities.map((city) => ({ province: province.slug, city: city.slug }))); }

export async function generateMetadata({ params }: { params: Promise<{ province: string; city: string }> }): Promise<Metadata> {
  const route = await params;
  const data = getCity(route.province, route.city);
  if (!data) return {};
  return buildPageMetadata({ title: `Ramen restaurants in ${data.city.name}, ${data.province.code}`, description: `Compare ${data.restaurants.length} ramen restaurants in ${data.city.name} by verified menu style, price evidence, late-night hours, vegan bowls and reservations.`, path: `/locations/${route.province}/${route.city}`, indexable: isCityIndexable(data.restaurants) });
}

export default async function CityPage({ params }: { params: Promise<{ province: string; city: string }> }) {
  const route = await params;
  const data = getCity(route.province, route.city);
  if (!data) notFound();
  const facts = cityFacts(data.restaurants);
  const styles = [["miso", facts.miso], ["shoyu", facts.shoyu], ["tsukemen", facts.tsukemen], ["tonkotsu", facts.tonkotsu]].filter(([, count]) => Number(count) > 0);
  const range = facts.priceMin !== null ? `${formatMoney(facts.priceMin)}${facts.priceMax !== null && facts.priceMax !== facts.priceMin ? `–${formatMoney(facts.priceMax)}` : ""}` : null;
  return <main className="page-shell"><Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Locations", href: "/locations" }, { label: data.province.name, href: `/locations/${data.province.slug}` }, { label: data.city.name }]} /><header className="page-hero city-hero"><p className="eyebrow"><span /> Local ramen field guide</p><h1>Ramen in {data.city.name}, {data.province.code}.</h1><p>Compare {facts.count} local ramen restaurants. Current source checks cover {facts.verifiedMenus} menus{range ? ` and observed ramen prices from ${range}` : ""}; {facts.lateNight} spots list service until at least 11 p.m. on one or more days.</p></header><section className="metric-row" aria-label={`${data.city.name} directory summary`}><div><strong>{facts.count}</strong><span>restaurants</span></div><div><strong>{facts.verifiedMenus}</strong><span>menus checked</span></div><div><strong>{facts.pricedMenus}</strong><span>priced menus</span></div><div><strong>{facts.reservations}</strong><span>take reservations</span></div></section>{styles.length ? <section className="city-insight"><div><p className="eyebrow"><span /> What menus confirm</p><h2>Styles found around {data.city.name}.</h2></div><div className="style-counts">{styles.map(([style, count]) => <Link href={`/styles/${style}`} key={style}><strong>{count}</strong><span>{style}</span></Link>)}</div></section> : null}{facts.neighbourhoods.length ? <nav className="neighbourhood-links" aria-label={`${data.city.name} neighbourhoods`}><span>Neighbourhoods in these listings:</span>{facts.neighbourhoods.slice(0, 12).map((neighbourhood) => <Link href={`/search?q=${encodeURIComponent(`${neighbourhood} ${data.city.name}`)}`} key={neighbourhood}>{neighbourhood}</Link>)}</nav> : null}<section className="content-section"><div className="result-heading"><h2 id="city-results">All {data.city.name} listings</h2><p>Unknown facts are shown as unconfirmed, never assumed to mean “no.”</p></div><RestaurantList restaurants={data.restaurants} headingId="city-results" /></section><aside className="editorial-note"><h2>Before you go</h2><p>Menus and hours can change between checks. Use the verification date on each listing, then confirm time-sensitive details—especially holiday hours, vegan preparation and reservation availability—with the restaurant.</p></aside></main>;
}
