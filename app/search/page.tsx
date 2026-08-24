import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SearchDirectory } from "@/components/SearchDirectory";
import searchIndexJson from "@/public/data/search-index.json";
import { buildPageMetadata } from "@/lib/site";
import { getSearchResults, isSearchFeature, type SearchRecord } from "@/lib/types";

export const metadata = buildPageMetadata({
  title: "Search Canadian ramen restaurants",
  description: "Search ramen restaurants across Canada by location and confirmed menu or service features.",
  path: "/search",
  indexable: false,
});

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; feature?: string | string[] }> }) {
  const parameters = await searchParams;
  const query = (parameters.q ?? "").slice(0, 120);
  const rawFeatures = Array.isArray(parameters.feature) ? parameters.feature : parameters.feature ? [parameters.feature] : [];
  const initialFilters = [...new Set(rawFeatures.filter(isSearchFeature))];
  const searchIndex = searchIndexJson as SearchRecord[];
  const initialMatches = getSearchResults(searchIndex, query, initialFilters);

  return (
    <main className="page-shell">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Search" }]} />
      <header className="page-hero compact">
        <p className="eyebrow"><span /> Search the directory</p>
        <h1>Find the bowl that fits.</h1>
        <p>Search by restaurant, ramen style, menu item or place, then narrow the list using only confirmed facts. Search results and filter combinations are intentionally noindexed.</p>
      </header>
      <SearchDirectory
        initialQuery={query}
        initialFilters={initialFilters}
        initialRecords={initialMatches.slice(0, 24)}
        initialTotal={initialMatches.length}
        directoryTotal={searchIndex.length}
      />
    </main>
  );
}
