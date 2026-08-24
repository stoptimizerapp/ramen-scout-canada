"use client";

import { useState } from "react";
import { formatDistance, rankByDistance } from "@/lib/geo";
import type { SearchRecord } from "@/lib/types";

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
  const [closest, setClosest] = useState<{ record: SearchRecord; distance: number } | null>(null);

  async function findClosest() {
    if (!navigator.geolocation) {
      setStatus("Your browser does not support location access. Search by city or postal code instead.");
      return;
    }

    setPending(true);
    setClosest(null);
    setStatus("Waiting for location permission and loading the directory…");
    try {
      const [position, response] = await Promise.all([
        readCurrentPosition(),
        fetch("/data/search-index.json", { cache: "force-cache" }),
      ]);
      if (!response.ok) throw new Error(`Directory request failed: ${response.status}`);
      const records = await response.json() as SearchRecord[];
      const [closest] = rankByDistance(records, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (!closest || closest.distance === null) throw new Error("No geocoded restaurants are available");

      setClosest({ record: closest.item, distance: closest.distance });
      setStatus(`Closest match found: ${closest.item.name}, about ${formatDistance(closest.distance)} away.`);
      setPending(false);
    } catch (error) {
      setStatus(locationErrorMessage(error));
      setPending(false);
    }
  }

  return (
    <div className="nearby-finder">
      <button type="button" onClick={findClosest} disabled={pending}>
        <span aria-hidden="true">⌖</span>
        {pending ? "Finding the closest ramen…" : closest ? "Check my location again" : "Use my location"}
      </button>
      <p>Your coordinates stay in this page and are discarded after the nearest match is found.</p>
      <div className="nearby-status" role="status" aria-live="polite">{status}</div>
      {closest ? (
        <article className="nearby-match">
          <span>Closest listed restaurant · approximately {formatDistance(closest.distance)} straight-line distance</span>
          <strong>{closest.record.name}</strong>
          <p>{closest.record.address}, {closest.record.city}, {closest.record.provinceCode}</p>
          <a href={closest.record.path}>View restaurant details <span aria-hidden="true">→</span></a>
        </article>
      ) : null}
    </div>
  );
}
