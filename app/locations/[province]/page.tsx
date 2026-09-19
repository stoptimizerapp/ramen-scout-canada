import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { SiteLink as Link } from '@/components/SiteLink';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { MenuComparison } from '@/components/MenuComparison';
import { LocationRecords } from '@/components/LocationRecords';
import { getProvince, getProvinceRestaurants, isProvinceSearchReady, summary } from '@/lib/directory';
import { hasCityGuide, hasProvinceGuide, publicPath } from '@/lib/content-publication.js';
import { buildPageMetadata } from '@/lib/site';

export function generateStaticParams() { return summary.provinces.map(p => ({province:p.slug})); }
export async function generateMetadata({params}:{params:Promise<{province:string}>}):Promise<Metadata> {
  const {province:slug}=await params; const p=getProvince(slug);
  if(!p || !hasProvinceGuide(`/locations/${slug}`)) return {};
  return buildPageMetadata({title:`Ramen menus and locations in ${p.name}`,description:`Compare documented ramen bowls across ${p.name}, then find branch addresses, menu sources, hours and city comparisons.`,path:`/locations/${slug}`,indexable:isProvinceSearchReady(getProvinceRestaurants(slug))});
}
export default async function ProvincePage({params}:{params:Promise<{province:string}>}) {
  const {province:slug}=await params;const p=getProvince(slug);if(!p)notFound();
  if(!hasProvinceGuide(`/locations/${slug}`))permanentRedirect(publicPath(`/locations/${slug}`));
  const entries=getProvinceRestaurants(slug);
  const comparisonCities=p.cities.filter(c=>hasCityGuide(`/locations/${slug}/${c.slug}`));
  const otherCities=p.cities.filter(c=>!hasCityGuide(`/locations/${slug}/${c.slug}`));
  return <main className="page-shell"><Breadcrumbs items={[{label:'Home',href:'/'},{label:'Locations',href:'/locations'},{label:p.name}]} />
    <header className="page-hero"><p className="eyebrow">{p.code} menu and location guide</p><h1>Ramen in {p.name}.</h1><p>Compare named bowls across the province, or jump to a city for local options. Smaller communities are grouped below so you can see their actual menu coverage without opening an incomplete restaurant page. Restaurant counts reflect our research, not a complete census.</p></header>
    <MenuComparison restaurants={entries} title={`Menu examples across ${p.name}`} />
    {comparisonCities.length ? <section className="content-section"><h2>Compare restaurants within a city</h2><div className="city-directory">{comparisonCities.map(c=><Link href={`/locations/${slug}/${c.slug}`} key={c.slug}><h3>{c.name}</h3><span>{c.count} locations</span></Link>)}</div></section>:null}
    {otherCities.length ? <nav className="neighbourhood-links" aria-label="Smaller communities">{otherCities.map(c=><a href={`#city-${slug}-${c.slug}`} key={c.slug}>{c.name}</a>)}</nav>:null}
    {otherCities.map(c=><section className="content-section" id={`city-${slug}-${c.slug}`} key={c.slug}><h2>{c.name}</h2><LocationRecords restaurants={entries.filter(r=>r.citySlug===c.slug)} /></section>)}
    <aside className="editorial-note"><h2>Compare the same kind of order</h2><p>These are named menu examples, not provincial price rankings. Delivery prices and branch exceptions can change the comparison. A vegetarian dish is not assumed vegan, and a chicken topping does not establish chicken-only stock. The source date beside each menu tells you when the evidence was checked.</p><Link href="/guides/choosing-ramen">Worked examples: stocks, toppings and extras →</Link></aside>
  </main>;
}
