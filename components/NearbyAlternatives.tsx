import { SiteLink as Link } from "@/components/SiteLink";
import { directoryRestaurants } from "@/lib/directory";
import { distanceKm, formatDistance } from "@/lib/geo";
import { formatDate, formatMoney } from "@/lib/format";
import { comparableItems, pricedItems } from "@/lib/menu-planning";
import type { Restaurant } from "@/lib/types";

export function NearbyAlternatives({ origin, excludeIds = [], title = "Compare nearby menus" }: { origin: Restaurant; excludeIds?: string[]; title?: string }) {
  const { latitude, longitude } = origin.location;
  if (latitude === null || longitude === null) return null;
  const excluded = new Set([origin.id, ...excludeIds]);
  const nearby = directoryRestaurants.filter((r) => !excluded.has(r.id) && comparableItems(r).length && r.location.latitude !== null && r.location.longitude !== null)
    .map((r) => ({ restaurant: r, distance: distanceKm({ latitude, longitude }, { latitude: r.location.latitude!, longitude: r.location.longitude! }) }))
    .filter((r) => r.distance <= 60).sort((a, b) => a.distance - b.distance || a.restaurant.id.localeCompare(b.restaurant.id)).slice(0, 3);
  if (!nearby.length) return null;
  return <section className="nearby-comparisons"><p className="section-kicker">A practical alternative</p><h2>{title}</h2><p>Nearest restaurants with documented menu items, within 60 km of {origin.location.street}, {origin.location.city}. Distances are straight-line estimates—not driving times or routes. Bridges, ferries and traffic can make the trip much longer.</p><div className="decision-grid">{nearby.map(({ restaurant: r, distance }) => {
    const item = pricedItems(r.menu.items)[0] || r.menu.items[0];
    return <article key={r.id}><small>{formatDistance(distance)} away · {r.location.city}</small><h3><Link href={r.canonicalPath}>{r.name}</Link></h3><p>{r.location.street}</p><p><strong>{item.name}</strong>{item.price !== undefined ? ` · ${formatMoney(item.price)}` : " · price not confirmed"}</p><p className="source-note">Menu checked {formatDate(r.menu.verifiedAt)}. {r.hours.lateNightStatus === "yes" ? "Listed service reaches 11 p.m. or later on some days; check the weekly schedule." : "See listing for service hours."}</p></article>;
  })}</div></section>;
}
