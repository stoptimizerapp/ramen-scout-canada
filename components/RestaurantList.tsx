import type { Restaurant } from "@/lib/types";
import { RestaurantCard } from "./RestaurantCard";

export function RestaurantList({ restaurants, headingId }: { restaurants: Restaurant[]; headingId?: string }) {
  return <div className="restaurant-grid" aria-labelledby={headingId}>{restaurants.map((restaurant) => <RestaurantCard restaurant={restaurant} key={restaurant.id} />)}</div>;
}
