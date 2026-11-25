import restaurants from "@/data/restaurants.json";
import reviews from "@/data/menu-source-reviews.json";
import type { Restaurant } from "./types";
import type { BowlOption } from "./bowl-planner";
import { comparableItems } from "./menu-planning";
import { publicPath } from "./content-publication.js";

const sourceCounts = new Map<string, number>();
for (const r of restaurants) if (r.menu.url) sourceCounts.set(r.menu.url, (sourceCounts.get(r.menu.url) || 0) + 1);
const sourceReviews = reviews as Record<string, { checkedOn: string; status: string; note: string }>;

export function menuContext(r: Restaurant) {
  const review = sourceReviews[r.menu.url || ""];
  const shared = (sourceCounts.get(r.menu.url || "") || 0) > 1;
  const notes = [shared ? "Shared menu source; confirm branch availability." : "", review?.note || ""].filter(Boolean);
  return { note: notes.join(" ") || "Dated menu evidence; confirm extras and availability.", budgetEligible: !review || !["branch_mismatch", "unavailable", "partial"].includes(review.status), review };
}

export function plannerOptions(entries: Restaurant[], filter?: string): BowlOption[] {
  const groups = entries.map(r => {
    const context = menuContext(r);
    return comparableItems(r, filter).map(item => ({
      id: `${r.id}:${item.name}`, restaurant: r.name, address: r.location.street, city: r.location.city,
      path: publicPath(r.canonicalPath), name: item.name, price: item.price,
      styles: [...(item.brothStyle || []), ...(item.tare || []), ...(item.servingStyle || [])],
      vegan: Boolean(item.dietary?.includes("vegan") || r.vegan.itemNames.includes(item.name)),
      source: r.menu.url, checked: r.menu.verifiedAt, context: context.note, budgetEligible: context.budgetEligible,
    }));
  });
  // Rotate through restaurants so the first results offer distinct places to eat.
  const result: BowlOption[] = [];
  for (let index = 0; index < Math.max(0, ...groups.map(group => group.length)); index++) {
    for (const group of groups) if (group[index]) result.push(group[index]);
  }
  return result;
}
