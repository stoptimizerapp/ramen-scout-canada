import type { Metadata } from 'next';
import { SiteLink as Link } from '@/components/SiteLink';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LocationRecords } from '@/components/LocationRecords';
import { summary, directoryRestaurants } from '@/lib/directory';
import { hasProvinceGuide } from '@/lib/content-publication.js';
import { buildPageMetadata } from '@/lib/site';
export const metadata: Metadata = buildPageMetadata({title:'Ramen menus and locations across Canada',description:'Choose a province, compare local ramen menus and find direct contact details for smaller communities across Canada.',path:'/locations'});
export default function LocationsPage(){
  const smaller=summary.provinces.filter(p=>!hasProvinceGuide(`/locations/${p.slug}`));
  return <main className="page-shell"><Breadcrumbs items={[{label:'Home',href:'/'},{label:'Locations'}]} /><header className="page-hero"><p className="eyebrow">Find a useful local comparison</p><h1>Browse ramen by location.</h1><p>Start with a provincial comparison, then narrow to a city or named bowl. The directory covers {summary.restaurantCount} business records across {summary.cityCount} communities. A contact record is not a menu recommendation: we separate records without dish-level evidence from researched menu guides.</p></header>
  <section className="province-grid" aria-label="Provinces and territories">{summary.provinces.map(p=><article className="province-card" key={p.slug}><span>{p.code}</span><h2><Link href={`/locations/${p.slug}`}>{p.name}</Link></h2><p>{p.count} records across {p.cities.length} communities</p><ul>{p.cities.slice(0,6).map(c=><li key={c.slug}><Link href={`/locations/${p.slug}/${c.slug}`}>{c.name}</Link><span>{c.count}</span></li>)}</ul><Link href={`/locations/${p.slug}`}>Explore {p.name} →</Link></article>)}</section>
  <aside className="editorial-note"><h2>When local choice is limited</h2><p>Small-community records appear together below or in their provincial guide. For alternatives across city boundaries, use the location button in search: distances are straight-line estimates, not travel times. Menu prices are dated observations, and an omitted dietary feature means unknown—not unavailable.</p><Link href="/search">Find ramen near your location →</Link></aside>
  {smaller.map(p=><section className="content-section" id={`province-${p.slug}`} key={p.slug}><h2>{p.name}</h2>{p.cities.map(c=><section className="content-section" id={`city-${p.slug}-${c.slug}`} key={c.slug}><h3>{c.name}</h3><LocationRecords restaurants={directoryRestaurants.filter(r=>r.provinceSlug===p.slug&&r.citySlug===c.slug)} /></section>)}</section>)}
  </main>;
}
