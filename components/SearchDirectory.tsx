"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getSearchResults,
  isSearchFeature,
  type SearchFeature,
  type SearchRecord,
} from "@/lib/types";

const PAGE_SIZE = 24;

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

const filterDefinitions: ReadonlyArray<readonly [SearchFeature, string]> = [
  ["tonkotsu", "Tonkotsu"],
  ["shoyu", "Shoyu"],
  ["miso", "Miso"],
  ["tsukemen", "Tsukemen"],
  ["vegan", "Complete vegan bowl"],
  ["late-night", "Late night"],
  ["reservations", "Reservations"],
  ["house-made-noodles", "Noodles made on site"],
];

function featuresFromUrl() {
  const values = new URLSearchParams(window.location.search).getAll("feature");
  return [...new Set(values.filter(isSearchFeature))];
}

function updateSearchUrl(query: string, features: SearchFeature[], mode: "push" | "replace") {
  const url = new URL(window.location.href);
  const cleanQuery = query.trim();
  if (cleanQuery) url.searchParams.set("q", cleanQuery);
  else url.searchParams.delete("q");
  url.searchParams.delete("feature");
  for (const feature of [...features].sort()) url.searchParams.append("feature", feature);

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) window.history[`${mode}State`]({}, "", nextUrl);
}

function sameFeatures(left: SearchFeature[], right: SearchFeature[]) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
}

type SearchDirectoryProps = {
  initialQuery?: string;
  initialFilters?: SearchFeature[];
  initialRecords: SearchRecord[];
  initialTotal: number;
  directoryTotal: number;
};

export function SearchDirectory({
  initialQuery = "",
  initialFilters = [],
  initialRecords,
  initialTotal,
  directoryTotal,
}: SearchDirectoryProps) {
  const [records, setRecords] = useState<SearchRecord[]>(initialRecords);
  const [hasFullIndex, setHasFullIndex] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFeature[]>(initialFilters);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/data/search-index.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Directory request failed: ${response.status}`);
        return response.json() as Promise<SearchRecord[]>;
      })
      .then((nextRecords) => {
        if (cancelled) return;
        setRecords(nextRecords);
        setHasFullIndex(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError("The complete directory could not be loaded. The first results are still available.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function restoreUrlState() {
      const searchParams = new URLSearchParams(window.location.search);
      setQuery(searchParams.get("q") ?? "");
      setFilters(featuresFromUrl());
      setLimit(PAGE_SIZE);
    }
    window.addEventListener("popstate", restoreUrlState);
    return () => window.removeEventListener("popstate", restoreUrlState);
  }, []);

  const filtered = useMemo(() => {
    const matches = getSearchResults(records, query, filters);
    if (!location) return matches;
    return matches.sort((a, b) => {
      const aDistance = a.latitude === null || a.longitude === null ? Infinity : distanceKm(location.latitude, location.longitude, a.latitude, a.longitude);
      const bDistance = b.latitude === null || b.longitude === null ? Infinity : distanceKm(location.latitude, location.longitude, b.latitude, b.longitude);
      return aDistance - bDistance || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
  }, [records, query, filters, location]);

  const initialCriteria = query.trim() === initialQuery.trim() && sameFeatures(filters, initialFilters);
  const resultTotal = hasFullIndex ? filtered.length : initialCriteria ? initialTotal : filtered.length;
  const resultLabel = `${resultTotal} ramen ${resultTotal === 1 ? "spot" : "spots"}`;

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    setLimit(PAGE_SIZE);
    updateSearchUrl(nextQuery, filters, "replace");
  }

  function updateFilter(value: SearchFeature) {
    const nextFilters = filters.includes(value) ? filters.filter((item) => item !== value) : [...filters, value];
    setLimit(PAGE_SIZE);
    setFilters(nextFilters);
    updateSearchUrl(query, nextFilters, "push");
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Your browser does not support location access.");
      return;
    }
    setLocationStatus("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationStatus("Sorted by distance. Your location stays in this browser and is not added to the URL.");
      },
      () => setLocationStatus("Location was not available. You can still search by city or postal code."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  return (
    <div className="search-directory">
      <form className="search-controls" action="/search" method="get">
        <div className="search-primary">
          <label htmlFor="directory-query">Restaurant, ramen style, menu item or location</label>
          <input
            id="directory-query"
            name="q"
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder={`Search all ${directoryTotal} restaurants`}
            aria-describedby="search-help"
          />
          <button type="button" onClick={requestLocation}>Use my location</button>
        </div>
        <fieldset aria-describedby="search-help">
          <legend>Only show confirmed features</legend>
          <div className="filter-options">
            {filterDefinitions.map(([value, label]) => (
              <label key={value}>
                <input name="feature" value={value} type="checkbox" checked={filters.includes(value)} onChange={() => updateFilter(value)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p id="search-help">Unknown values never match a confirmed-feature filter.</p>
      </form>

      <div className="location-status" role="status" aria-live="polite">
        {locationStatus ? <p>{locationStatus}</p> : null}
        {!hasFullIndex && !loadError ? <p>Showing the first {Math.min(initialTotal, initialRecords.length)} matches. The complete interactive index loads when JavaScript is available.</p> : null}
        {loadError ? <p>{loadError}</p> : null}
      </div>

      <noscript><p>Search needs JavaScript for the complete index and distance sorting. <Link href="/locations">Browse every location instead</Link>.</p></noscript>

      <div className="result-heading">
        <h2 aria-live="polite" aria-atomic="true">
          {!hasFullIndex && !initialCriteria && !loadError ? "Checking all restaurants…" : resultLabel}
        </h2>
        <p>{location ? "Nearest confirmed matches appear first." : "Results are ordered by relevance, then name."}</p>
      </div>

      <div className="search-results" aria-label="Ramen restaurant results">
        {filtered.slice(0, limit).map((record) => (
          <article className="search-result" key={record.id}>
            <div>
              <span>{record.provinceCode}</span>
              <h3><a href={record.path}>{record.name}</a></h3>
              <p>{record.neighbourhood ? `${record.neighbourhood}, ` : ""}{record.city} · {record.address}</p>
            </div>
            <p>{record.description}</p>
            <div className="search-result-meta">
              <span>{record.menuStatus === "verified_current" ? `Menu checked ${record.menuVerifiedAt}` : "Menu not verified"}</span>
              <strong>{record.priceMin === null ? "Price not confirmed" : record.priceMax && record.priceMax !== record.priceMin ? `$${record.priceMin}–$${record.priceMax}` : `From $${record.priceMin}`}</strong>
              <a href={record.path}>See details →</a>
            </div>
          </article>
        ))}
      </div>

      {!filtered.length && hasFullIndex ? (
        <div className="empty-state">
          <h2>No exact match yet</h2>
          <p>Try removing a confirmed-feature filter or searching a nearby city. Unknown facts are intentionally excluded from positive filters.</p>
        </div>
      ) : null}
      {limit < filtered.length ? <button className="load-more" type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)}>Show 24 more</button> : null}
    </div>
  );
}
