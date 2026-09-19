import type { Metadata } from "next";
import { SiteLink as Link } from "@/components/SiteLink";
import { notFound, permanentRedirect } from "next/navigation";
import { hasRestaurantGuide, publicPath } from "@/lib/content-publication.js";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FactBadge } from "@/components/FactBadge";
import { NearbyAlternatives } from "@/components/NearbyAlternatives";
import { pricedItems } from "@/lib/menu-planning";
import { directoryRestaurants, getRestaurant, isRestaurantSearchReady } from "@/lib/directory";
import { formatDate, formatHours, formatMoney, formatPriceRange, titleCaseToken, triStateLabel } from "@/lib/format";
import { absoluteUrl, pageRobots } from "@/lib/site";
import type { Restaurant } from "@/lib/types";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function generateStaticParams() { return directoryRestaurants.map((restaurant) => ({ province: restaurant.provinceSlug, city: restaurant.citySlug, slug: restaurant.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ province: string; city: string; slug: string }> }): Promise<Metadata> {
  const route = await params;
  const restaurant = getRestaurant(route.province, route.city, route.slug);
  if (!restaurant) return {};
  if (!hasRestaurantGuide(restaurant)) return { robots: pageRobots(false) };
  return {
    title: { absolute: restaurant.seo.title },
    description: restaurant.seo.description,
    alternates: { canonical: restaurant.canonicalPath },
    robots: pageRobots(isRestaurantSearchReady(restaurant)),
    openGraph: { type: "website", title: restaurant.seo.ogTitle || restaurant.seo.title, description: restaurant.seo.ogDescription || restaurant.seo.description, url: absoluteUrl(restaurant.canonicalPath), images: [] },
    twitter: { card: "summary", title: restaurant.seo.ogTitle || restaurant.seo.title, description: restaurant.seo.ogDescription || restaurant.seo.description, images: [] },
  };
}

function priceRangeSchema(restaurant: Restaurant) {
  if (restaurant.prices.observedCount < 3 || restaurant.prices.min === null) return undefined;
  const max = restaurant.prices.max ?? restaurant.prices.min;
  return `CA$${restaurant.prices.min.toFixed(2)}–CA$${max.toFixed(2)}`;
}

function openingHoursSchema(restaurant: Restaurant) {
  return days.flatMap((day) => {
    const value = restaurant.hours[day];
    if (!value || value === "closed") return [];
    return value.split("|").flatMap((interval) => {
      const match = interval.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})/);
      return match ? [{ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${day}`, opens: match[1], closes: match[2] }] : [];
    });
  });
}

function buildSchema(restaurant: Restaurant) {
  const url = absoluteUrl(restaurant.canonicalPath);
  const restaurantSchema: Record<string, unknown> = {
    "@type": "Restaurant",
    "@id": `${url}#restaurant`,
    name: restaurant.name,
    url,
    address: { "@type": "PostalAddress", streetAddress: restaurant.location.street, addressLocality: restaurant.location.city, addressRegion: restaurant.location.provinceCode, postalCode: restaurant.location.postalCode, addressCountry: restaurant.location.countryCode },
  };
  if (["primary", "substantial"].includes(restaurant.relevance.classification)) restaurantSchema.servesCuisine = ["Ramen"];
  if (restaurant.contact.phone) restaurantSchema.telephone = restaurant.contact.phone;
  if (restaurant.menu.url) restaurantSchema.hasMenu = restaurant.menu.url;
  const hours = openingHoursSchema(restaurant);
  if (hours.length) restaurantSchema.openingHoursSpecification = hours;
  const priceRange = priceRangeSchema(restaurant);
  if (priceRange) restaurantSchema.priceRange = priceRange;
  const sameAs = [restaurant.contact.website, restaurant.contact.mapsUrl].filter(Boolean);
  if (sameAs.length) restaurantSchema.sameAs = sameAs;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: restaurant.location.provinceName, item: absoluteUrl(`/locations/${restaurant.provinceSlug}`) },
        { "@type": "ListItem", position: 3, name: restaurant.location.city, item: absoluteUrl(`/locations/${restaurant.provinceSlug}/${restaurant.citySlug}`) },
        { "@type": "ListItem", position: 4, name: restaurant.name, item: url },
      ] },
      { "@type": "WebPage", "@id": `${url}#webpage`, url, name: restaurant.seo.h1, description: restaurant.seo.description, breadcrumb: { "@id": `${url}#breadcrumb` }, mainEntity: { "@id": `${url}#restaurant` } },
      restaurantSchema,
    ],
  };
}

function EvidenceReferences({ references }: { references?: string[] }) {
  const unique = [...new Set(references || [])];
  if (!unique.length) return null;
  return <small className="evidence-refs">Source{unique.length === 1 ? "" : "s"}: {unique.map((reference, index) => <span key={reference}>{index ? ", " : ""}<a href={`#source-${reference}`}>{reference}</a></span>)}</small>;
}

function StatusFact({ label, value, note, evidenceRefs }: { label: string; value: string; note?: string; evidenceRefs?: string[] }) {
  const unconfirmed = /not confirmed|unknown/i.test(value);
  if (unconfirmed && !note) return null;
  return <div className="status-fact"><span>{label}</span><strong className={unconfirmed ? "status-unknown" : ""}>{value}</strong>{note ? <small>{note}</small> : null}<EvidenceReferences references={evidenceRefs} /></div>;
}

function veganLabel(restaurant: Restaurant) {
  if (restaurant.vegan.status === "multiple_complete_bowls") return `${restaurant.vegan.bowlCount || "Multiple"} complete vegan bowls confirmed`;
  if (restaurant.vegan.status === "one_complete_bowl") return "One complete vegan bowl confirmed";
  if (restaurant.vegan.status === "restaurant_claim_unverified") return "Vegan options claimed; complete bowl not confirmed";
  return "Not confirmed";
}

function halalLabel(restaurant: Restaurant) {
  if (restaurant.halal.verifiedOptions === "yes") return "Independently verified halal options";
  if (restaurant.halal.status.startsWith("restaurant_declared")) return "Restaurant-declared halal option; certification not independently verified";
  if (restaurant.halal.status === "unverified_third_party_claim") return "Third-party halal attribute only; not independently verified";
  return "Not confirmed";
}

function noodleLabel(restaurant: Restaurant) {
  if (restaurant.noodles.status === "made_on_site") return "Noodles confirmed made on site";
  if (restaurant.noodles.status === "made_by_same_company_off_site") return "Made by the same company off site";
  if (restaurant.noodles.status === "restaurant_claimed_unspecified") return "House-made claim found; production location not stated";
  return "Not confirmed";
}

export default async function RestaurantPage({ params }: { params: Promise<{ province: string; city: string; slug: string }> }) {
  const route = await params;
  const restaurant = getRestaurant(route.province, route.city, route.slug);
  if (!restaurant) notFound();
  if (!hasRestaurantGuide(restaurant)) permanentRedirect(publicPath(restaurant.canonicalPath));
  const schema = buildSchema(restaurant);
  const serializedSchema = JSON.stringify(schema).replace(/</g, "\\u003c");
  const priced = pricedItems(restaurant.menu.items);
  const lowest = priced[0];
  const highest = priced.at(-1);
  const styleBadges = [
    restaurant.taxonomy.tonkotsu === "yes" ? "Confirmed tonkotsu" : null,
    restaurant.taxonomy.shoyu === "yes" ? "Confirmed shoyu" : null,
    restaurant.taxonomy.miso === "yes" ? "Confirmed miso" : null,
    restaurant.taxonomy.tsukemen === "yes" ? "Confirmed tsukemen" : null,
  ].filter(Boolean) as string[];
  return (
    <main className="listing-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializedSchema }} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: restaurant.location.provinceName, href: `/locations/${restaurant.provinceSlug}` }, { label: restaurant.location.city, href: `/locations/${restaurant.provinceSlug}/${restaurant.citySlug}` }, { label: restaurant.name }]} />
      <header className="listing-hero">
        <div className="listing-heading"><p className="eyebrow"><span /> {restaurant.location.city} ramen guide</p><h1>{restaurant.seo.h1}</h1><p>{restaurant.location.street}, {restaurant.location.city}, {restaurant.location.provinceCode} {restaurant.location.postalCode}</p><div className="badge-list">{styleBadges.length ? styleBadges.map((badge) => <FactBadge tone="positive" key={badge}>{badge}</FactBadge>) : <FactBadge>Ramen style not confirmed</FactBadge>}{restaurant.hours.lateNightStatus === "yes" ? <FactBadge tone="positive">Late-night service</FactBadge> : null}</div></div>
        <div className="listing-actions">
          {restaurant.contact.mapsUrl ? <a className="button primary" href={restaurant.contact.mapsUrl} rel="nofollow noopener noreferrer" target="_blank">Directions <span aria-hidden="true">↗</span></a> : null}
          {restaurant.contact.phone ? <a className="button" href={`tel:${restaurant.contact.phone}`}>Call</a> : null}
          {restaurant.contact.menuUrl ? <a className="button" href={restaurant.contact.menuUrl} rel="nofollow noopener noreferrer" target="_blank">Official menu</a> : null}
          {restaurant.reservations.url ? <a className="button" href={restaurant.reservations.url} rel="nofollow noopener noreferrer" target="_blank">Reserve</a> : null}
        </div>
      </header>

      <section className="verification-strip" aria-label="Verification status"><div><span>Menu</span><strong>{restaurant.menu.status === "verified_current" ? "Current source checked" : restaurant.menu.status === "available_unverified" ? "Available, not fully verified" : "Not available"}</strong><small>{formatDate(restaurant.menu.verifiedAt)}</small></div><div><span>Hours</span><strong>{restaurant.hours.confidence === "unknown" ? "Not confirmed" : "Source checked"}</strong><small>{formatDate(restaurant.hours.verifiedAt)}</small></div><div><span>Price evidence</span><strong>{restaurant.prices.observedCount ? `${restaurant.prices.observedCount} observed ${restaurant.prices.observedCount === 1 ? "item" : "items"}` : "Not confirmed"}</strong><small>{formatDate(restaurant.prices.verifiedAt)}</small></div><p>Always confirm time-sensitive details directly with the restaurant.</p></section>

      <div className="listing-layout">
        <article className="listing-content" data-publisher-content>
          <section><p className="section-kicker">At a glance</p><h2>What to know about {restaurant.name}</h2><p className="lead-copy">{restaurant.content.editorialDescription}</p>{!restaurant.menu.items.length ? <p className="unknown-callout">This is a location record, not a reviewed menu recommendation. We have not confirmed item-level ramen choices for this branch. Use its official contact details or compare documented menus nearby below.</p> : null}</section>
          {restaurant.menu.items.length ? <section><p className="section-kicker">What to order</p><h2>Menu highlights</h2>{restaurant.content.whatToOrder ? <p>{restaurant.content.whatToOrder}</p> : null}{restaurant.menu.items.length ? <div className="menu-list">{restaurant.menu.items.map((item) => <article key={item.name}><div><h3>{item.name}</h3><p>{[...(item.brothStyle || []), ...(item.tare || []), ...(item.servingStyle || [])].map(titleCaseToken).join(" · ") || "Ramen-family menu item"}</p><EvidenceReferences references={item.evidenceRefs} /></div><strong>{item.price !== undefined ? formatMoney(item.price) : "Price not confirmed"}</strong></article>)}</div> : <p className="unknown-callout">Item-level menu details were not confirmed in the latest source check.</p>}</section> : null}
          <section><p className="section-kicker">Broth, noodles &amp; dietary details</p><h2>Menu and dietary evidence</h2><p className="source-note">Only supported facts are expanded below. An omitted detail is unknown, not unavailable; ask the restaurant about dietary preparation or accessibility requirements that are essential to your visit.</p><div className="fact-matrix"><StatusFact label="Tonkotsu" value={triStateLabel(restaurant.taxonomy.tonkotsu, "Confirmed on menu", "Not found on a complete checked menu")} evidenceRefs={restaurant.taxonomy.evidenceRefs} /><StatusFact label="Shoyu" value={triStateLabel(restaurant.taxonomy.shoyu, "Confirmed on menu", "Not found on a complete checked menu")} evidenceRefs={restaurant.taxonomy.evidenceRefs} /><StatusFact label="Miso" value={triStateLabel(restaurant.taxonomy.miso, "Confirmed on menu", "Not found on a complete checked menu")} evidenceRefs={restaurant.taxonomy.evidenceRefs} /><StatusFact label="Tsukemen" value={triStateLabel(restaurant.taxonomy.tsukemen, "Confirmed on menu", "Not found on a complete checked menu")} evidenceRefs={restaurant.taxonomy.evidenceRefs} /><StatusFact label="Vegan ramen" value={veganLabel(restaurant)} note={restaurant.vegan.itemNames.length ? restaurant.vegan.itemNames.join(", ") : undefined} evidenceRefs={restaurant.vegan.evidenceRefs} /><StatusFact label="Halal" value={halalLabel(restaurant)} note={restaurant.halal.note} evidenceRefs={restaurant.halal.evidenceRefs} /><StatusFact label="Noodle production" value={noodleLabel(restaurant)} note={restaurant.noodles.scope} evidenceRefs={restaurant.noodles.evidenceRefs} /><StatusFact label="Observed ramen prices" value={formatPriceRange(restaurant)} note={restaurant.prices.verifiedAt ? `Checked ${formatDate(restaurant.prices.verifiedAt)}` : undefined} evidenceRefs={restaurant.prices.evidenceRefs} /></div></section>
          <section><p className="section-kicker">Hours</p><h2>Weekly service hours</h2><div className="table-wrap"><table className="hours-table"><caption>Listed weekly hours for {restaurant.name}; check holiday and same-day changes directly.</caption><tbody>{days.map((day) => <tr key={day}><th scope="row">{day}</th><td>{formatHours(restaurant.hours[day])}</td></tr>)}</tbody></table></div><p className="source-note">Hours source checked {formatDate(restaurant.hours.verifiedAt)} · Time zone: {restaurant.location.timezone || "Not confirmed"}</p></section>
          <section><p className="section-kicker">Visit planning</p><h2>Service and accessibility</h2><div className="fact-matrix compact-facts"><StatusFact label="Dine-in" value={triStateLabel(restaurant.services.dineIn, "Available")} evidenceRefs={restaurant.services.evidenceRefs} /><StatusFact label="Takeout" value={triStateLabel(restaurant.services.takeout, "Available")} evidenceRefs={restaurant.services.evidenceRefs} /><StatusFact label="Delivery" value={triStateLabel(restaurant.services.delivery, "Available")} evidenceRefs={restaurant.services.evidenceRefs} /><StatusFact label="Reservations" value={restaurant.reservations.status === "accepted" ? "Accepted" : restaurant.reservations.status === "required" ? "Required" : restaurant.reservations.status === "waitlist_only" ? "Waitlist only, not an advance reservation" : restaurant.reservations.status === "not_offered_confirmed" ? "Reported unavailable" : "Not confirmed"} evidenceRefs={restaurant.reservations.evidenceRefs} /><StatusFact label="Wheelchair-accessible entrance" value={triStateLabel(restaurant.services.wheelchairEntrance, "Reported available")} evidenceRefs={restaurant.services.evidenceRefs} /><StatusFact label="Wheelchair-accessible seating" value={triStateLabel(restaurant.services.wheelchairSeating, "Reported available")} evidenceRefs={restaurant.services.evidenceRefs} /></div>{restaurant.content.caveats ? <div className="caveat"><strong>Before you go</strong><p>{restaurant.content.caveats}</p></div> : null}</section>
          {lowest && highest && priced.length >= 2 ? <section className="budget-note"><p className="section-kicker">Budget the bowl</p><h2>What changes the price?</h2><p>Among the {priced.length} named, priced examples shown here, {lowest.name} is {formatMoney(lowest.price)}{highest.price > lowest.price ? ` and ${highest.name} is ${formatMoney(highest.price)}—a difference of ${formatMoney(Math.round((highest.price - lowest.price) * 100) / 100)} per bowl` : "; the examples carry the same listed price"}. Two orders of {lowest.name} would total {formatMoney(Math.round(lowest.price * 2 * 100) / 100)} before any applicable tax, tip, extras or delivery fees. This is a calculation from the recorded menu, not a live quote or the restaurant’s full price range.</p><p className="source-note">Price source checked {formatDate(restaurant.prices.verifiedAt)}. <a href={restaurant.menu.url} target="_blank" rel="noopener noreferrer">Check the current menu</a>.</p></section> : null}
          <NearbyAlternatives origin={restaurant} />
          <section id="sources"><p className="section-kicker">Sources &amp; transparency</p><h2>Where these details came from</h2><p>We synthesize facts from official restaurant pages and attributed business data, keep unsupported claims unknown, and keep commercial decisions separate from directory rankings.</p><div className="source-list">{restaurant.evidence.map((source) => <article id={`source-${source.id}`} key={source.id}><div><strong>{source.id} · {source.publisher || titleCaseToken(source.sourceType || "Source")}</strong><span>{source.sourceType ? titleCaseToken(source.sourceType) : "Source"} · checked {formatDate(source.retrievedAt || source.effectiveDate)}</span>{source.supports?.length ? <small>Supports: {source.supports.map(titleCaseToken).join(", ")}</small> : null}</div>{source.url ? <a href={source.url} rel="nofollow noopener noreferrer" target="_blank">Open source <span aria-hidden="true">↗</span></a> : null}</article>)}</div><p className="source-note">See something outdated? <Link href={`/corrections?restaurant=${encodeURIComponent(restaurant.name)}&id=${restaurant.id}`}>Report a correction</Link>.</p></section>
        </article>

        <aside className="listing-sidebar" aria-label="Restaurant summary"><div className="sidebar-card"><p className="section-kicker">Plan your visit</p><h2>{restaurant.name}</h2><address>{restaurant.location.street}<br />{restaurant.location.city}, {restaurant.location.provinceCode} {restaurant.location.postalCode}</address><dl><div><dt>Price</dt><dd>{formatPriceRange(restaurant)}</dd></div><div><dt>Late night</dt><dd>{restaurant.hours.lateNightStatus === "yes" ? `Yes${restaurant.hours.lateNightDays.length ? ` · ${restaurant.hours.lateNightDays.join(", ")}` : ""}` : restaurant.hours.lateNightStatus === "no" ? "No, based on listed hours" : "Not confirmed"}</dd></div><div><dt>Reservations</dt><dd>{restaurant.reservations.status === "accepted" ? "Accepted" : restaurant.reservations.status === "required" ? "Required" : restaurant.reservations.status === "waitlist_only" ? "Waitlist only, not an advance reservation" : restaurant.reservations.status === "not_offered_confirmed" ? "Reported unavailable" : "Not confirmed"}</dd></div><div><dt>Menu checked</dt><dd>{formatDate(restaurant.menu.verifiedAt)}</dd></div></dl>{restaurant.contact.website ? <a className="text-link" href={restaurant.contact.website} rel="nofollow noopener noreferrer" target="_blank">Official website ↗</a> : null}</div></aside>
      </div>
      <p className="related-section"><Link href={`/locations/${restaurant.provinceSlug}/${restaurant.citySlug}`}>Compare all {restaurant.location.city} listings →</Link> · <Link href="/guides/choosing-ramen">How to compare a ramen menu</Link></p>
    </main>
  );
}
