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

export function publisherContentWordCount(restaurant) {
  const content = restaurant.content || {};
  const faqText = (content.faqs || []).flatMap((faq) => [faq.question, faq.answer]);
  const text = [
    content.shortDescription,
    content.editorialDescription,
    content.whyGo,
    content.whatToOrder,
    content.bestFor,
    content.visitTips,
    content.neighbourhoodContext,
    content.caveats,
    ...faqText,
  ].filter(Boolean).join(" ");
  return text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function isRelevantRamenListing(restaurant) {
  return SEARCH_READY_RELEVANCE.has(restaurant.relevance?.classification);
}

export function isRestaurantSearchReady(restaurant, now = Date.now()) {
  const publication = restaurant.publication || {};
  const gates = publication.gates || {};
  const nextReviewDue = Date.parse(restaurant.nextReviewDue || "");
  const officialEvidence = (restaurant.evidence || []).some((evidence) => (
    OFFICIAL_SOURCE_TYPES.has(evidence.sourceType)
    && /^https?:\/\//i.test(evidence.url || "")
    && /^[a-f0-9]{64}$/.test(evidence.contentHash || "")
  ));

  return publication.qualityScore >= SEARCH_READINESS.minimumQualityScore
    && publication.verifiedDecisionFieldCount >= SEARCH_READINESS.minimumVerifiedDecisionFields
    && REQUIRED_CONTENT_GATES.every((gate) => gates[gate] === "yes")
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
