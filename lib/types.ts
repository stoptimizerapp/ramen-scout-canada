export type TriState = "yes" | "no" | "unknown";

export type Evidence = {
  id: string;
  url?: string;
  sourceType?: string;
  publisher?: string;
  retrievedAt?: string;
  effectiveDate?: string;
  supports?: string[];
  contentHash?: string;
};

export type MenuItem = {
  name: string;
  price?: number;
  brothBase?: string[];
  brothStyle?: string[];
  tare?: string[];
  servingStyle?: string[];
  dietary?: string[];
  evidenceRefs?: string[];
};

export type Restaurant = {
  id: string;
  placeId: string;
  name: string;
  alternateNames: string[];
  brandName?: string;
  branchName?: string;
  slug: string;
  canonicalPath: string;
  provinceSlug: string;
  citySlug: string;
  publication: {
    status: string;
    robots: string;
    adsAllowed: string;
    gateStatus: string;
    failCodes: string[];
    qualityScore: number;
    verifiedDecisionFieldCount: number;
    humanReviewedAt?: string;
    reviewerId?: string;
    approvalHash?: string;
    contentHash: string;
    evidenceHash: string;
    schemaHash: string;
    rendererHash: string;
    searchReadinessSupplement?: {
      verifiedAt: string;
      url: string;
      finalUrl: string;
      extractionMethod: "crawl4ai_normalized_markdown" | "crawl4ai_page_plus_verified_document";
      contentHash: string;
      pageContentHash: string;
      statusCode: number;
      markdownChars: number;
      linkedDocuments: Array<{
        url: string;
        finalUrl: string;
        contentType: string;
        bytes: number;
        contentHash: string;
      }>;
      crawl4aiSuccess: boolean;
      corroboration: {
        ramenTerms: number;
        priceSignals: number;
        matchedItems: number;
      };
      qualityScore: number;
      verifiedDecisionFieldCount: number;
      verifiedDecisionGroups: string[];
    };
    gates: {
      identity: string;
      relevance: string;
      freshness: string;
      decisionData: string;
      evidence: string;
      originality: string;
      schema: string;
      visibleSchemaParity: string;
      rights: string;
      humanReview: string;
      adsenseContent: string;
    };
  };
  contact: { phone?: string; website?: string; locationUrl?: string; menuUrl?: string; reservationUrl?: string; orderUrl?: string; mapsUrl?: string };
  location: {
    street: string;
    neighbourhood?: string;
    city: string;
    provinceName: string;
    provinceCode: string;
    postalCode: string;
    countryCode: string;
    latitude: number | null;
    longitude: number | null;
    timezone: string;
    parking: string[];
  };
  relevance: { classification: string; itemCount: number; reason: string; verifiedAt?: string; confidence: string; evidenceRefs: string[] };
  hours: Record<"Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday", string> & {
    verifiedAt?: string;
    confidence: string;
    lateNightStatus: TriState;
    lateNightDays: string[];
    latestClose?: string;
    evidenceRefs: string[];
  };
  menu: { status: string; url?: string; sourceType: string; verifiedAt?: string; confidence: string; itemCount: number; items: MenuItem[]; evidenceRefs: string[] };
  taxonomy: {
    brothBases: string[];
    brothStyles: string[];
    tares: string[];
    servingStyles: string[];
    tonkotsu: TriState;
    shoyu: TriState;
    miso: TriState;
    tsukemen: TriState;
    verifiedAt?: string;
    confidence: string;
    evidenceRefs: string[];
  };
  vegan: { status: string; bowlCount: number | null; customizationRequired: TriState; itemNames: string[]; note?: string; verifiedAt?: string; confidence: string; evidenceRefs: string[] };
  halal: { status: string; verifiedOptions: TriState; scope?: string; certifier?: string; sourceType: string; note?: string; verifiedAt?: string; confidence: string; evidenceRefs: string[] };
  noodles: { status: string; verified: TriState; scope?: string; makingLocation?: string; styleValues: string[]; verifiedAt?: string; confidence: string; evidenceRefs: string[] };
  prices: { currency: string; observedCount: number; min: number | null; max: number | null; median: number | null; typical: number | null; band: string; verifiedAt?: string; confidence: string; evidenceRefs: string[] };
  reservations: { status: string; channels: string[]; url?: string; note?: string; verifiedAt?: string; confidence: string; evidenceRefs: string[] };
  services: {
    dineIn: TriState;
    takeout: TriState;
    delivery: TriState;
    outdoorSeating: TriState;
    wheelchairEntrance: TriState;
    wheelchairSeating: TriState;
    wheelchairWashroom: TriState;
    familyFriendly: TriState;
    alcohol: TriState;
    verifiedAt?: string;
    confidence: string;
    evidenceRefs: string[];
  };
  content: {
    shortDescription: string;
    editorialDescription: string;
    whyGo?: string;
    whatToOrder?: string;
    bestFor?: string;
    visitTips?: string;
    neighbourhoodContext?: string;
    caveats?: string;
    faqs: Array<{ question: string; answer: string; evidenceRefs?: string[]; verifiedAt?: string }>;
  };
  seo: { title: string; description: string; h1: string; primaryKeyword: string; topics: string[]; breadcrumbLabel: string; ogTitle: string; ogDescription: string };
  evidence: Evidence[];
  refreshedAt: string;
  nextReviewDue: string;
};

export type DirectorySummary = {
  generatedAt: string;
  baseRestaurantCount: number;
  curatedAdditionCount: number;
  restaurantCount: number;
  provinceCount: number;
  cityCount: number;
  verifiedMenuCount: number;
  pricedMenuCount: number;
  lateNightCount: number;
  reservationCount: number;
  styleCounts: Record<"tonkotsu" | "shoyu" | "miso" | "tsukemen", number>;
  veganCompleteCount: number;
  verifiedHalalCount: number;
  houseMadeNoodleCount: number;
  provinces: Array<{
    code: string;
    slug: string;
    name: string;
    count: number;
    cities: Array<{ name: string; slug: string; count: number; verifiedMenus: number; pricedMenus: number; lateNight: number }>;
  }>;
};

export type SearchRecord = {
  id: string;
  name: string;
  alternateNames: string[];
  brandName?: string;
  branchName?: string;
  path: string;
  city: string;
  citySlug: string;
  province: string;
  provinceCode: string;
  neighbourhood?: string;
  address: string;
  postalCode: string;
  fsa?: string;
  styles: string[];
  signatureItems: string[];
  latitude: number | null;
  longitude: number | null;
  description: string;
  menuStatus: string;
  menuVerifiedAt?: string;
  priceMin: number | null;
  priceMax: number | null;
  priceBand: string;
  tonkotsu: TriState;
  shoyu: TriState;
  miso: TriState;
  tsukemen: TriState;
  veganStatus: string;
  halalVerified: TriState;
  noodlesStatus: string;
  lateNight: TriState;
  reservations: string;
};

export const searchFeatureValues = [
  "tonkotsu",
  "shoyu",
  "miso",
  "tsukemen",
  "vegan",
  "halal",
  "late-night",
  "reservations",
  "house-made-noodles",
] as const;

export type SearchFeature = (typeof searchFeatureValues)[number];

export function isSearchFeature(value: string): value is SearchFeature {
  return (searchFeatureValues as readonly string[]).includes(value);
}

export function normalizeDirectorySearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isExactCitySearch(records: SearchRecord[], query: string) {
  const normalizedQuery = normalizeDirectorySearch(query);
  if (!normalizedQuery) return false;

  return records.some((record) => {
    const city = normalizeDirectorySearch(record.city);
    const province = normalizeDirectorySearch(record.province);
    const provinceCode = normalizeDirectorySearch(record.provinceCode);
    return normalizedQuery === city
      || normalizedQuery === `${city} ${provinceCode}`
      || normalizedQuery === `${city} ${province}`;
  });
}

function matchesConfirmedFeature(record: SearchRecord, feature: SearchFeature) {
  if (feature === "tonkotsu" || feature === "shoyu" || feature === "miso" || feature === "tsukemen") {
    return record[feature] === "yes";
  }
  if (feature === "vegan") return ["one_complete_bowl", "multiple_complete_bowls"].includes(record.veganStatus);
  if (feature === "halal") return record.halalVerified === "yes";
  if (feature === "late-night") return record.lateNight === "yes";
  if (feature === "reservations") return ["accepted", "required"].includes(record.reservations);
  if (feature === "house-made-noodles") return record.noodlesStatus === "made_on_site";
  return false;
}

function searchRank(record: SearchRecord, normalizedQuery: string) {
  if (!normalizedQuery) return 0;
  const name = normalizeDirectorySearch(record.name);
  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (name.includes(normalizedQuery)) return 2;

  const places = [record.city, record.neighbourhood, record.province, record.provinceCode, record.fsa, record.postalCode]
    .filter((value): value is string => Boolean(value))
    .map(normalizeDirectorySearch);
  if (places.some((place) => place === normalizedQuery)) return 3;
  if (record.signatureItems.some((item) => normalizeDirectorySearch(item).includes(normalizedQuery))) return 4;
  return 5;
}

export function getSearchResults(records: SearchRecord[], query: string, features: SearchFeature[]) {
  const normalizedQuery = normalizeDirectorySearch(query);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return records
    .filter((record) => {
      const haystack = normalizeDirectorySearch([
        record.name,
        ...record.alternateNames,
        record.brandName,
        record.branchName,
        record.city,
        record.neighbourhood,
        record.province,
        record.provinceCode,
        record.address,
        record.postalCode,
        record.fsa,
        ...record.styles,
        ...record.signatureItems,
      ].filter((value): value is string => Boolean(value)).join(" "));
      return tokens.every((token) => haystack.includes(token))
        && features.every((feature) => matchesConfirmedFeature(record, feature));
    })
    .sort((a, b) => searchRank(a, normalizedQuery) - searchRank(b, normalizedQuery)
      || a.name.localeCompare(b.name)
      || a.city.localeCompare(b.city)
      || a.id.localeCompare(b.id));
}
