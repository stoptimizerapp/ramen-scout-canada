import { SiteLink as Link } from "@/components/SiteLink";
import { formatDate, formatPriceRange } from "@/lib/format";
import type { Restaurant } from "@/lib/types";
import { FactBadge } from "./FactBadge";

function badges(restaurant: Restaurant) {
  const values: string[] = [];
  if (restaurant.taxonomy.tonkotsu === "yes") values.push("Confirmed tonkotsu");
  if (restaurant.taxonomy.shoyu === "yes") values.push("Confirmed shoyu");
  if (restaurant.taxonomy.miso === "yes") values.push("Confirmed miso");
  if (restaurant.taxonomy.tsukemen === "yes") values.push("Confirmed tsukemen");
  if (["one_complete_bowl", "multiple_complete_bowls"].includes(restaurant.vegan.status)) values.push("Complete vegan bowl");
  if (restaurant.noodles.status === "made_on_site") values.push("Noodles made on site");
  if (restaurant.hours.lateNightStatus === "yes") values.push("Late night");
  return values.slice(0, 3);
}

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const knownBadges = badges(restaurant);
  return (
    <article className="restaurant-card">
      <div className="card-topline">
        <span>{restaurant.location.provinceCode}</span>
        <span>{restaurant.menu.status === "verified_current" ? `Menu checked ${formatDate(restaurant.menu.verifiedAt)}` : "Menu details not confirmed"}</span>
      </div>
      <h3><Link href={restaurant.canonicalPath}>{restaurant.name}</Link></h3>
      <p className="card-address">{restaurant.location.neighbourhood ? `${restaurant.location.neighbourhood} · ` : ""}{restaurant.location.city}</p>
      <p className="card-description">{restaurant.content.shortDescription}</p>
      <div className="badge-list">
        {knownBadges.length ? knownBadges.map((badge) => <FactBadge tone="positive" key={badge}>{badge}</FactBadge>) : <FactBadge>Menu styles not confirmed</FactBadge>}
      </div>
      <div className="card-footer">
        <span>{formatPriceRange(restaurant)}</span>
        <Link href={restaurant.canonicalPath} aria-label={`View details for ${restaurant.name}`}>View details <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}
