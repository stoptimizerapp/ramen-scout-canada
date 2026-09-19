/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- A named, horizontally scrollable table region needs keyboard focus. */
import { SiteLink as Link } from "@/components/SiteLink";
import { comparisonRows } from "@/lib/menu-planning";
import { formatDate, formatMoney } from "@/lib/format";
import type { Restaurant } from "@/lib/types";

export function MenuComparison({ restaurants, title, filter, limit = 12 }: { restaurants: Restaurant[]; title: string; filter?: string; limit?: number }) {
  const rows = comparisonRows(restaurants, filter);
  if (!rows.length) return null;
  return <section className="menu-comparison content-section">
    <p className="section-kicker">Compare before choosing</p><h2>{title}</h2>
    <p>One documented bowl per restaurant, choosing the lowest priced example we have{filter === "vegan" ? " that is explicitly vegan" : filter && ["tonkotsu", "shoyu", "miso", "tsukemen"].includes(filter) ? ` that matches ${filter}` : ""}. These are menu examples, not a cheapest-in-town ranking or a complete menu. Prices are in CAD; tax, tips and delivery fees may be additional.</p>
    <div className="table-wrap" tabIndex={0} role="region" aria-label={title}><table className="comparison-table"><caption>{rows.length > limit ? `First ${limit} of ${rows.length} documented menus, alphabetically. All listings follow below.` : `${rows.length} documented menus, alphabetically. A missing price is not treated as zero.`}</caption><thead><tr><th scope="col">Restaurant &amp; branch</th><th scope="col">Bowl to compare</th><th scope="col">Visit constraints</th><th scope="col">Source check</th></tr></thead><tbody>{rows.slice(0, limit).map(({ restaurant: r, item }) => <tr key={r.id}>
      <th scope="row"><Link href={r.canonicalPath}>{r.name}</Link><small>{r.location.street}<br />{r.location.city}</small></th>
      <td>{item.name}<strong>{item.price !== undefined ? formatMoney(item.price) : "Price not published here"}</strong></td>
      <td>{r.hours.lateNightStatus === "yes" ? `11 p.m. or later: ${r.hours.lateNightDays.join(", ") || "see weekly hours"}. ` : ""}{r.reservations.status === "not_offered_confirmed" ? "No advance reservations reported." : ["accepted", "required"].includes(r.reservations.status) ? `Reservations ${r.reservations.status}.` : "Booking policy not confirmed."}</td>
      <td><a href={r.menu.url} target="_blank" rel="noopener noreferrer">Menu source ↗</a><small>{formatDate(r.menu.verifiedAt)}</small></td>
    </tr>)}</tbody></table></div>
  </section>;
}
