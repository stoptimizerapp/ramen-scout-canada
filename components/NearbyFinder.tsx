"use client";

import { useState } from "react";
import { formatDistance, rankNearestGeocoded } from "@/lib/geo";
import type { SearchRecord } from "@/lib/types";

const NEARBY_LIMIT = 6;

function readCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    });
  });
}

function locationErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? Number((error as { code: unknown }).code)
    : null;
  if (code === 1) {
    return "Location permission was declined. Search by city or postal code instead.";
  }
  if (code === 3) {
    return "Your location took too long to arrive. Try again or search by place.";
  }
  if (code === 2) return "Your device could not determine a location. Try again or search by place.";
  return "The complete directory could not be loaded, so a reliable closest match is not available. Try the full search instead.";
}

export function NearbyFinder() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [nearby, setNearby] = useState<Array<{ record: SearchRecord; distance: number }>>([]);

  async function findClosest() {
    if (!navigator.geolocation) {
      setStatus("Your browser does not support location access. Search by city or postal code instead.");
      return;
    }

    setPending(true);
    setNearby([]);
    setStatus("Waiting for location permission and loading the directory…");
    try {
      const [position, response] = await Promise.all([
        readCurrentPosition(),
        fetch("/data/search-index.json", { cache: "force-cache" }),
      ]);
      if (!response.ok) throw new Error(`Directory request failed: ${response.status}`);
      const records = await response.json() as SearchRecord[];
      const matches = rankNearestGeocoded(records, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }, NEARBY_LIMIT)
        .map(({ item: record, distance }) => ({ record, distance }));
      if (!matches.length) throw new Error("No geocoded restaurants are available");

      setNearby(matches);
      const cityCount = new Set(matches.map(({ record }) => `${record.provinceCode}:${record.city}`)).size;
      setStatus(`Showing ${matches.length} nearest listed restaurants across ${cityCount} ${cityCount === 1 ? "city" : "cities"}. Distances are straight-line estimates.`);
    } catch (error) {
      setStatus(locationErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="nearby-finder">
      <button type="button" onClick={findClosest} disabled={pending}>
        <span aria-hidden="true">⌖</span>
        {pending ? "Finding nearby ramen…" : nearby.length ? "Check my location again" : "Use my location"}
      </button>
      <p>Your coordinates stay in this page and are discarded after the nearest matches are found.</p>
      <div className="nearby-status" role="status" aria-live="polite">{status}</div>
      {nearby.length ? (
        <ol className="nearby-matches" aria-label="Nearest ramen restaurants">
          {nearby.map(({ record, distance }, index) => (
            <li key={record.id}>
              <article className="nearby-match">
                <span>{index === 0 ? "Closest listed restaurant" : `Nearby option ${index + 1}`} · approximately {formatDistance(distance)} away</span>
                <strong>{record.name}</strong>
                <p>{record.address}, {record.city}, {record.provinceCode}</p>
                <a href={record.path}>View restaurant details <span aria-hidden="true">→</span></a>
              </article>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
