import { deriveSearchReadinessProfile, publisherContentWordCount } from "./search-readiness-profile.js";

const SEARCH_READY_RELEVANCE = new Set(["primary", "substantial"]);
const REQUIRED_CONTENT_GATES = [
  "identity",
  "relevance",
  "freshness",
  "decisionData",
  "evidence",
  "originality",
  "rights",
];

const OFFICIAL_SOURCE_TYPES = new Set(["official_site", "official_menu"]);
const MAXIMUM_SUPPLEMENT_AGE_MS = 120 * 24 * 60 * 60 * 1000;

export { publisherContentWordCount };

export const SEARCH_READINESS = Object.freeze({
  minimumQualityScore: 90,
  minimumVerifiedDecisionFields: 6,
  minimumPublisherWords: 200,
  minimumEvidenceSources: 2,
  minimumCityRelevantListings: 5,
  minimumCityVerifiedMenus: 3,
  minimumProvinceReadyListings: 8,
  minimumProvinceReadyCities: 2,
  minimumFacetReadyListings: 8,
});

export function isRelevantRamenListing(restaurant) {
  return SEARCH_READY_RELEVANCE.has(restaurant.relevance?.classification);
}

export function isRestaurantSearchReady(restaurant, now = Date.now()) {
  const publication = restaurant.publication || {};
  const gates = publication.gates || {};
  const supplement = publication.searchReadinessSupplement || {};
  const supplementDate = Date.parse(supplement.verifiedAt || "");
  const profile = deriveSearchReadinessProfile(restaurant, now);
  const supplementEvidence = (restaurant.evidence || []).find((evidence) => (
    evidence.url === supplement.url
    && evidence.sourceType === "official_menu"
    && evidence.contentHash === supplement.contentHash
    && evidence.retrievedAt === supplement.verifiedAt
    && (restaurant.menu?.evidenceRefs || []).includes(evidence.id)
  ));
  const verifiedGroups = Object.entries(profile.facts).filter(([, verified]) => verified).map(([group]) => group).sort();
  const documentBacked = supplement.extractionMethod === "crawl4ai_page_plus_verified_document";
  const validLinkedDocuments = documentBacked
    && Array.isArray(supplement.linkedDocuments)
    && supplement.linkedDocuments.length > 0
    && supplement.linkedDocuments.every((document) => (
      /^https:\/\//i.test(document.url || "")
      && /^https:\/\//i.test(document.finalUrl || "")
      && /^(?:image\/|application\/pdf$)/.test(document.contentType || "")
      && Number.isInteger(document.bytes)
      && document.bytes >= 1_000
      && /^[a-f0-9]{64}$/.test(document.contentHash || "")
    ));
  const validSupplement = supplement.crawl4aiSuccess === true
    && ["crawl4ai_normalized_markdown", "crawl4ai_page_plus_verified_document"].includes(supplement.extractionMethod)
    && supplement.url === restaurant.menu?.url
    && /^https:\/\//i.test(supplement.finalUrl || "")
    && Number.isInteger(supplement.statusCode)
    && supplement.statusCode >= 200
    && supplement.statusCode < 400
    && /^[a-f0-9]{64}$/.test(supplement.contentHash || "")
    && /^[a-f0-9]{64}$/.test(supplement.pageContentHash || "")
    && supplement.markdownChars >= 200
    && (supplement.corroboration?.ramenTerms || 0) >= (documentBacked ? 1 : 2)
    && ((supplement.corroboration?.matchedItems || 0) >= 1 || (supplement.corroboration?.priceSignals || 0) >= 2 || validLinkedDocuments)
    && (documentBacked ? validLinkedDocuments : !(supplement.linkedDocuments || []).length)
    && Number.isFinite(supplementDate)
    && supplementDate <= now + 5 * 60 * 1000
    && now - supplementDate <= MAXIMUM_SUPPLEMENT_AGE_MS
    && supplement.qualityScore === profile.qualityScore
    && supplement.verifiedDecisionFieldCount === profile.decisionFieldCount
    && JSON.stringify([...(supplement.verifiedDecisionGroups || [])].sort()) === JSON.stringify(verifiedGroups)
    && Boolean(supplementEvidence)
    && profile.qualityScore >= SEARCH_READINESS.minimumQualityScore
    && profile.decisionFieldCount >= SEARCH_READINESS.minimumVerifiedDecisionFields;
  const qualityScore = Math.max(publication.qualityScore || 0, validSupplement ? profile.qualityScore : 0);
  const decisionFieldCount = Math.max(publication.verifiedDecisionFieldCount || 0, validSupplement ? profile.decisionFieldCount : 0);
  const nextReviewDue = Date.parse(restaurant.nextReviewDue || "");
  const officialEvidence = (restaurant.evidence || []).some((evidence) => (
    OFFICIAL_SOURCE_TYPES.has(evidence.sourceType)
    && /^https?:\/\//i.test(evidence.url || "")
    && /^[a-f0-9]{64}$/.test(evidence.contentHash || "")
  ));

  return qualityScore >= SEARCH_READINESS.minimumQualityScore
    && decisionFieldCount >= SEARCH_READINESS.minimumVerifiedDecisionFields
    && REQUIRED_CONTENT_GATES.every((gate) => (
      gates[gate] === "yes"
      || ["decisionData", "freshness"].includes(gate) && validSupplement
    ))
    && isRelevantRamenListing(restaurant)
    && restaurant.menu?.status === "verified_current"
    && /^https?:\/\//i.test(restaurant.menu?.url || "")
    && (restaurant.menu?.evidenceRefs || []).length > 0
    && (restaurant.evidence || []).length >= SEARCH_READINESS.minimumEvidenceSources
    && officialEvidence
    && publisherContentWordCount(restaurant) >= SEARCH_READINESS.minimumPublisherWords
    && Number.isFinite(nextReviewDue)
    && nextReviewDue >= now;
}

export function isCitySearchReady(entries, now = Date.now()) {
  const relevant = entries.filter((restaurant) => {
    const nextReviewDue = Date.parse(restaurant.nextReviewDue || "");
    return isRelevantRamenListing(restaurant) && Number.isFinite(nextReviewDue) && nextReviewDue >= now;
  });
  const verifiedMenus = relevant.filter((restaurant) => restaurant.menu?.status === "verified_current");
  return relevant.length >= SEARCH_READINESS.minimumCityRelevantListings
    && verifiedMenus.length >= SEARCH_READINESS.minimumCityVerifiedMenus;
}

export function isProvinceSearchReady(entries, now = Date.now()) {
  const ready = entries.filter((restaurant) => isRestaurantSearchReady(restaurant, now));
  const cities = new Set(ready.map((restaurant) => `${restaurant.provinceSlug}:${restaurant.citySlug}`));
  return ready.length >= SEARCH_READINESS.minimumProvinceReadyListings
    && cities.size >= SEARCH_READINESS.minimumProvinceReadyCities;
}

export function isFacetSearchReady(entries, now = Date.now()) {
  return entries.filter((restaurant) => isRestaurantSearchReady(restaurant, now)).length
    >= SEARCH_READINESS.minimumFacetReadyListings;
}
