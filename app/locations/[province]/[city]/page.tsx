import type { Metadata } from "next";
import { SiteLink as Link } from "@/components/SiteLink";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LocationRecords } from "@/components/LocationRecords";
import { hasCityGuide, publicPath } from "@/lib/content-publication.js";
import { MenuComparison } from "@/components/MenuComparison";
import { NearbyAlternatives } from "@/components/NearbyAlternatives";
import { cityFacts, getCity, isCitySearchReady, summary } from "@/lib/directory";
import { buildPageMetadata } from "@/lib/site";

export function generateStaticParams() { return summary.provinces.flatMap((province) => province.cities.map((city) => ({ province: province.slug, city: city.slug }))); }

export async function generateMetadata({ params }: { params: Promise<{ province: string; city: string }> }): Promise<Metadata> {
  const route = await params;
  const data = getCity(route.province, route.city);
  if (!data) return {};
  if (!hasCityGuide(`/locations/${route.province}/${route.city}`)) return {};
  return buildPageMetadata({ title: `Ramen restaurants in ${data.city.name}, ${data.province.code}`, description: `Compare ${data.restaurants.length} ramen restaurants in ${data.city.name} by verified menu style, price evidence, late-night hours, vegan bowls and reservations.`, path: `/locations/${route.province}/${route.city}`, indexable: isCitySearchReady(data.restaurants) });
}

export default async function CityPage({ params }: { params: Promise<{ province: string; city: string }> }) {
  const route = await params;
  const data = getCity(route.province, route.city);
  if (!data) notFound();
  if (!hasCityGuide(`/locations/${route.province}/${route.city}`)) permanentRedirect(publicPath(`/locations/${route.province}/${route.city}`));
  const facts = cityFacts(data.restaurants);
  const menuListings = data.restaurants.filter((r) => r.menu.status === "verified_current" && r.menu.items.length);
  const basicListings = data.restaurants.filter((r) => !menuListings.includes(r));
  const styles = [["miso", facts.miso], ["shoyu", facts.shoyu], ["tsukemen", facts.tsukemen], ["tonkotsu", facts.tonkotsu]].filter(([, count]) => Number(count) > 0);
  return <main className="page-shell">
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Locations", href: "/locations" }, { label: data.province.name, href: `/locations/${data.province.slug}` }, { label: data.city.name }]} />
    <header className="page-hero city-hero"><p className="eyebrow"><span /> Local ramen field guide</p><h1>Ramen in {data.city.name}, {data.province.code}.</h1><p>{facts.count} locations in our directory, with {menuListings.length} documented menus to compare. Start with a named bowl and its source date, then check the branch address and service schedule. Our coverage is not a claim that these are every ramen restaurant in {data.city.name}.</p></header>
    {styles.length ? <nav className="neighbourhood-links" aria-label={`Filter ramen in ${data.city.name}`}><span>Filter this city:</span>{styles.map(([style, count]) => <Link href={`/search?q=${encodeURIComponent(data.city.name)}&feature=${style}`} key={style}>{style} · {count}</Link>)}<Link href={`/search?q=${encodeURIComponent(data.city.name)}&feature=vegan`}>Vegan bowls</Link><Link href={`/search?q=${encodeURIComponent(data.city.name)}&feature=late-night`}>Late night</Link></nav> : null}
    <MenuComparison restaurants={data.restaurants} title={`A bowl-by-bowl starting point for ${data.city.name}`} />
    {menuListings.length < 3 && data.restaurants[0] ? <NearbyAlternatives origin={data.restaurants[0]} excludeIds={data.restaurants.map((r) => r.id)} title={`More menu choices outside ${data.city.name}`} /> : null}
    {facts.neighbourhoods.length ? <nav className="neighbourhood-links" aria-label={`${data.city.name} neighbourhoods`}><span>Explore by neighbourhood:</span>{facts.neighbourhoods.slice(0, 12).map((neighbourhood) => <Link href={`/search?q=${encodeURIComponent(`${neighbourhood} ${data.city.name}`)}`} key={neighbourhood}>{neighbourhood}</Link>)}</nav> : null}
    {menuListings.length ? <section className="content-section"><div className="result-heading"><h2 id="city-results">{data.city.name}: menus and visit details</h2><p>Compare the dishes below; expand a record for its weekly schedule. Full guides are linked where available.</p></div><LocationRecords restaurants={menuListings} /></section> : null}
    {basicListings.length ? <section className="content-section"><h2>Additional locations to check directly</h2><p>These are contact records, not verified menu recommendations. Confirm ramen availability directly before travelling.</p><LocationRecords restaurants={basicListings} /></section> : null}
    <aside className="editorial-note"><h2>How to use this comparison</h2><p>Branch menus and delivery menus may differ. Our examples exclude unpriced dishes from budget calculations but do not treat them as unavailable. Late-night means a listed close of 11 p.m. or later on at least one day—not a confirmed last-order time. For dietary requirements, read the exact bowl and preparation notes rather than relying on a restaurant-level label.</p><Link href="/guides/choosing-ramen">See worked examples from Canadian menus →</Link></aside>
  </main>;
}
