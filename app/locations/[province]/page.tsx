import type { Metadata } from "next";
import { SiteLink as Link } from "@/components/SiteLink";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RestaurantList } from "@/components/RestaurantList";
import { getProvince, getProvinceRestaurants, isRestaurantIndexable, summary } from "@/lib/directory";
import { buildPageMetadata } from "@/lib/site";

export function generateStaticParams() { return summary.provinces.map((province) => ({ province: province.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ province: string }> }): Promise<Metadata> {
  const { province: slug } = await params;
  const province = getProvince(slug);
  if (!province) return {};
  const entries = getProvinceRestaurants(slug);
  const indexable = entries.filter(isRestaurantIndexable);
  const cityCount = new Set(indexable.map((restaurant) => restaurant.location.city)).size;
  const eligible = indexable.length >= 8 && cityCount >= 2;
  return buildPageMetadata({ title: `Ramen restaurants in ${province.name}`, description: `Browse ${province.count} ramen restaurants across ${province.cities.length} ${province.name} cities, with menu, price, service and verification details.`, path: `/locations/${slug}`, indexable: eligible });
}

export default async function ProvincePage({ params }: { params: Promise<{ province: string }> }) {
  const { province: slug } = await params;
  const province = getProvince(slug);
  if (!province) notFound();
  const entries = getProvinceRestaurants(slug);
  const verified = entries.filter((restaurant) => restaurant.menu.status === "verified_current").length;
  const lateNight = entries.filter((restaurant) => restaurant.hours.lateNightStatus === "yes").length;
  const sample = entries.filter((restaurant) => restaurant.menu.status === "verified_current").slice(0, 6);
  return <main className="page-shell"><Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Locations", href: "/locations" }, { label: province.name }]} /><header className="page-hero"><p className="eyebrow"><span /> {province.code} field guide</p><h1>Ramen restaurants in {province.name}.</h1><p>Explore {province.count} ramen spots across {province.cities.length} {province.cities.length === 1 ? "city" : "cities"}. We found {verified} current menu sources and {lateNight} restaurants with service until at least 11 p.m. on one or more days.</p></header><section className="metric-row" aria-label={`${province.name} directory summary`}><div><strong>{province.count}</strong><span>restaurants</span></div><div><strong>{province.cities.length}</strong><span>cities</span></div><div><strong>{verified}</strong><span>menus checked</span></div><div><strong>{lateNight}</strong><span>late night</span></div></section><section className="content-section"><div className="section-heading"><div><p className="eyebrow"><span /> Choose a city</p><h2>Explore {province.name} by city.</h2></div></div><div className="city-directory">{province.cities.map((city) => <Link href={`/locations/${province.slug}/${city.slug}`} key={city.slug}><div><h3>{city.name}</h3><p>{city.verifiedMenus} verified {city.verifiedMenus === 1 ? "menu" : "menus"} · {city.lateNight} late-night</p></div><strong>{city.count}<span> spots</span></strong></Link>)}</div></section>{sample.length ? <section className="content-section"><div className="section-heading"><div><p className="eyebrow"><span /> Menu-rich listings</p><h2>A useful place to start.</h2></div></div><RestaurantList restaurants={sample} /></section> : null}</main>;
}
