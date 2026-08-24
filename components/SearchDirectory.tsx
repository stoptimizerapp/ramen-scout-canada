"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDistance, rankByDistance, rankByDistanceWithFallback, type Coordinates } from "@/lib/geo";
import { createRetryableLoader } from "@/lib/retryable-loader";
import {
  getSearchResults,
  isExactCitySearch,
  isSearchFeature,
  type SearchFeature,
  type SearchRecord,
} from "@/lib/types";

const PAGE_SIZE = 24;
const NEARBY_RESULT_LIMIT = 6;

const filterDefinitions: ReadonlyArray<readonly [SearchFeature, string]> = [
  ["tonkotsu", "Tonkotsu"],
  ["shoyu", "Shoyu"],
  ["miso", "Miso"],
  ["tsukemen", "Tsukemen"],
  ["vegan", "Complete vegan bowl"],
  ["halal", "Verified halal"],
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

function readCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    });
  });
}

function geolocationErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return Number((error as { code: unknown }).code);
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
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationPending, setLocationPending] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const fullIndexLoader = useRef<(() => Promise<SearchRecord[]>) | null>(null);

  const loadFullIndex = useCallback(() => {
    fullIndexLoader.current ??= createRetryableLoader(() => (
      fetch("/data/search-index.json", { cache: "force-cache" }).then((response) => {
        if (!response.ok) throw new Error(`Directory request failed: ${response.status}`);
        return response.json() as Promise<SearchRecord[]>;
      })
    ));
    return fullIndexLoader.current();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadFullIndex()
      .then((nextRecords) => {
        if (cancelled) return;
        setRecords(nextRecords);
        setHasFullIndex(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError("The complete directory could not be loaded. The first results are still available.");
      });
    return () => { cancelled = true; };
  }, [loadFullIndex]);

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

  const locationResults = useMemo(() => {
    const matches = getSearchResults(records, query, filters);
    if (!location) {
      return {
        expanded: false,
        exactCount: matches.length,
        results: matches.map((item) => ({ item, distance: null, isExactMatch: true })),
      };
    }

    if (!isExactCitySearch(records, query) || matches.length >= NEARBY_RESULT_LIMIT) {
      return {
        expanded: false,
        exactCount: matches.length,
        results: rankByDistance(matches, location).map((result) => ({ ...result, isExactMatch: true })),
      };
    }

    return rankByDistanceWithFallback(
      matches,
      getSearchResults(records, "", filters),
      location,
      NEARBY_RESULT_LIMIT,
    );
  }, [records, query, filters, location]);
  const rankedResults = locationResults.results;
  const filtered = rankedResults.map(({ item }) => item);

  const initialCriteria = query.trim() === initialQuery.trim() && sameFeatures(filters, initialFilters);
  const resultTotal = hasFullIndex ? filtered.length : initialCriteria ? initialTotal : filtered.length;
  const resultLabel = `${resultTotal} ramen ${resultTotal === 1 ? "spot" : "spots"}`;
  const displayedLocationStatus = location && locationResults.expanded
    ? `The city search “${query.trim()}” has ${locationResults.exactCount} exact ${locationResults.exactCount === 1 ? "match" : "matches"}, so ${rankedResults.length} of the closest restaurants that meet the selected filters are shown across nearby cities. Distances are straight-line estimates; your coordinates stay in this tab and are not added to the URL or sent to Ramen Scout.`
    : locationStatus;

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

  async function requestLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Your browser does not support location access. Search by city or postal code instead.");
      return;
    }
    setLocationPending(true);
    setLocationStatus("Waiting for permission and loading all restaurants before calculating the closest match…");
    try {
      const [position, nextRecords] = await Promise.all([readCurrentPosition(), loadFullIndex()]);
      setRecords(nextRecords);
      setHasFullIndex(true);
      setLoadError("");
      setLimit(PAGE_SIZE);
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setLocationStatus("Closest matching restaurants are shown first. Distances are straight-line estimates; your coordinates stay in this tab and are not added to the URL or sent to Ramen Scout.");
    } catch (error) {
      const code = geolocationErrorCode(error);
      if (code === 1) setLocationStatus("Location permission was declined. Search by city or postal code instead, or change the permission in your browser settings.");
      else if (code === 3) setLocationStatus("Your location took too long to arrive. Try again or search by city or postal code.");
      else if (code === 2) setLocationStatus("Your device could not determine a location. Try again or search by place.");
      else setLocationStatus("The complete directory could not be loaded, so a reliable closest match is not available. Search by city or postal code instead.");
    } finally {
      setLocationPending(false);
    }
  }

  function clearLocation() {
    setLocation(null);
    setLimit(PAGE_SIZE);
    setLocationStatus("Location removed. Results are no longer ordered by distance.");
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
          <div className="location-controls">
            <button type="button" onClick={requestLocation} disabled={locationPending} aria-busy={locationPending}>
              {locationPending ? "Finding nearby ramen…" : location ? "Update my location" : "Use my location"}
            </button>
            {location ? <button className="clear-location" type="button" onClick={clearLocation}>Stop using my location</button> : null}
          </div>
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
        {displayedLocationStatus ? <p>{displayedLocationStatus}</p> : null}
        {!hasFullIndex && !loadError ? <p>Showing the first {Math.min(initialTotal, initialRecords.length)} matches. The complete interactive index loads when JavaScript is available.</p> : null}
        {loadError ? <p>{loadError}</p> : null}
      </div>

      <noscript><p>Search needs JavaScript for the complete index and distance sorting. <Link href="/locations">Browse every location instead</Link>.</p></noscript>

      <div className="result-heading">
        <h2 aria-live="polite" aria-atomic="true">
          {!hasFullIndex && !initialCriteria && !loadError ? "Checking all restaurants…" : resultLabel}
        </h2>
        <p>{locationResults.expanded ? "Exact city matches are kept, then nearby options are added by distance." : location ? "Nearest matches for the current search appear first; distances are straight-line estimates." : "Results are ordered by relevance, then name."}</p>
      </div>

      <div className="search-results" aria-label="Ramen restaurant results">
        {rankedResults.slice(0, limit).map(({ item: record, distance, isExactMatch }, index) => (
          <article className={`search-result${location && index === 0 ? " closest-result" : ""}`} key={record.id}>
            <div>
              <span>{locationResults.expanded
                ? index === 0
                  ? `Closest restaurant shown · ${record.city}, ${record.provinceCode}`
                  : isExactMatch
                    ? `Exact ${record.city} match · ${record.provinceCode}`
                    : `Nearby option · ${record.city}, ${record.provinceCode}`
                : location && index === 0
                  ? `Closest matching restaurant · ${record.provinceCode}`
                  : record.provinceCode}</span>
              <h3><a href={record.path}>{record.name}</a></h3>
              <p>{record.neighbourhood ? `${record.neighbourhood}, ` : ""}{record.city} · {record.address}</p>
            </div>
            <p>{record.description}</p>
            <div className="search-result-meta">
              {distance !== null ? <strong className="distance-label">Approximately {formatDistance(distance)} away</strong> : null}
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
