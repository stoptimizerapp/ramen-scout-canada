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

export function formatDistance(distance: number) {
  if (distance < 0.05) return "under 50 m";
  if (distance < 1) return `${Math.round(distance * 1000 / 50) * 50} m`;
  if (distance < 10) return `${distance.toFixed(1)} km`;
  return `${Math.round(distance)} km`;
}
