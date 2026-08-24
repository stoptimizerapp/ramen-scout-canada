export type GeographicPoint = {
  latitude: number | null;
  longitude: number | null;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export function distanceKm(origin: Coordinates, destination: Coordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(origin.latitude))
    * Math.cos(radians(destination.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function rankByDistance<T extends GeographicPoint>(items: T[], origin: Coordinates) {
  return items
    .map((item) => ({
      item,
      distance: item.latitude === null || item.longitude === null
        ? null
        : distanceKm(origin, { latitude: item.latitude, longitude: item.longitude }),
    }))
    .sort((left, right) => {
      if (left.distance === null) return right.distance === null ? 0 : 1;
      if (right.distance === null) return -1;
      return left.distance - right.distance;
    });
}

export function rankNearestGeocoded<T extends GeographicPoint>(items: T[], origin: Coordinates, limit: number) {
  return rankByDistance(items, origin)
    .filter((result): result is typeof result & { distance: number } => result.distance !== null)
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function rankByDistanceWithFallback<T extends GeographicPoint & { id: string }>(
  exactItems: T[],
  eligibleItems: T[],
  origin: Coordinates,
  minimumResults: number,
) {
  const exactIds = new Set(exactItems.map((item) => item.id));
  const rankedExact = rankByDistance(exactItems, origin);
  const missingCount = Math.max(0, Math.floor(minimumResults) - rankedExact.length);
  const fallback = missingCount > 0
    ? rankNearestGeocoded(eligibleItems.filter((item) => !exactIds.has(item.id)), origin, missingCount)
    : [];
  const fallbackIds = new Set(fallback.map(({ item }) => item.id));

  return {
    expanded: fallback.length > 0,
    exactCount: rankedExact.length,
    results: rankByDistance(
      [...exactItems, ...eligibleItems.filter((item) => fallbackIds.has(item.id))],
      origin,
    ).map((result) => ({ ...result, isExactMatch: exactIds.has(result.item.id) })),
  };
}

export function formatDistance(distance: number) {
  if (distance < 0.05) return "under 50 m";
  if (distance < 1) return `${Math.round(distance * 1000 / 50) * 50} m`;
  if (distance < 10) return `${distance.toFixed(1)} km`;
  return `${Math.round(distance)} km`;
}
