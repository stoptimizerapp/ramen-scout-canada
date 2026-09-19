import { SiteLink as Link } from './SiteLink';
import { formatDate, formatMoney, formatHours } from '@/lib/format';
import { hasRestaurantGuide, usableMenuItems } from '@/lib/content-publication.js';
import type { Restaurant } from '@/lib/types';

// Short records have one permanent home in a comparison hub, not a thin page.
export function LocationRecords({ restaurants }: { restaurants: Restaurant[] }) {
  return <div className="location-records">{restaurants.map(r => {
    const items = usableMenuItems(r);
    return <article className="location-record" id={r.id} key={r.id}>
      <h3>{hasRestaurantGuide(r) ? <Link href={r.canonicalPath}>{r.name}</Link> : r.name}</h3>
      <p><strong>{r.location.street}, {r.location.city}</strong>{r.location.postalCode ? ` · ${r.location.postalCode}` : ''}</p>
      {items.length ? <><p className="source-note">Selected menu examples · checked {formatDate(r.menu.verifiedAt)}. Not the full menu; prices may differ for delivery.</p><ul className="record-menu">{items.map(item => <li key={item.name}><span>{item.name}</span><strong>{typeof item.price === 'number' ? formatMoney(item.price) : 'Price not recorded'}</strong></li>)}</ul>
        <details><summary>Weekly hours and ordering information</summary><dl className="record-hours">{(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const).map(day => <div key={day}><dt>{day}</dt><dd>{formatHours(r.hours[day])}</dd></div>)}</dl><p className="source-note">Hours source checked {formatDate(r.hours.verifiedAt)}; confirm holidays and last orders.</p>{r.reservations.status === 'accepted' ? <p>Reservations reported accepted; confirm directly for your party.</p> : r.reservations.status === 'not_offered_confirmed' ? <p>No advance reservations reported.</p> : null}{['one_complete_bowl', 'multiple_complete_bowls'].includes(r.vegan.status) && r.vegan.itemNames.length ? <p>Explicitly vegan menu choices: {r.vegan.itemNames.join(', ')}. Ask about allergy cross-contact separately.</p> : null}</details></> : <p className="source-note">Contact record only: bowl choices and current prices have not been verified.</p>}
      <div className="record-links">{r.contact.website ? <a href={r.contact.website} target="_blank" rel="noopener noreferrer">Website ↗</a> : null}{items.length && r.menu.url ? <a href={r.menu.url} target="_blank" rel="noopener noreferrer">Menu source ↗</a> : null}{r.contact.phone ? <a href={`tel:${r.contact.phone}`}>Call {r.contact.phone}</a> : null}{r.contact.mapsUrl ? <a href={r.contact.mapsUrl} target="_blank" rel="noopener noreferrer">Map ↗</a> : null}{hasRestaurantGuide(r) ? <Link href={r.canonicalPath}>Full ordering guide →</Link> : null}<Link href={`/corrections?restaurant=${encodeURIComponent(r.name)}&id=${r.id}`}>Suggest a correction</Link></div>
    </article>;
  })}</div>;
}
