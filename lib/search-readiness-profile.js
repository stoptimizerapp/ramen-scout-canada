const OFFICIAL_SOURCE_TYPES = new Set(["official_site", "official_menu"]);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

export function deriveSearchReadinessProfile(restaurant, now = Date.now()) {
  const evidenceById = new Map((restaurant.evidence || []).map((evidence) => [evidence.id, evidence]));
  const hasAnyEvidence = (references) => (references || []).some((reference) => evidenceById.has(reference));
  const hasOfficialEvidence = (references) => (references || []).some((reference) => OFFICIAL_SOURCE_TYPES.has(evidenceById.get(reference)?.sourceType));
  const taxonomyKnown = [restaurant.taxonomy?.tonkotsu, restaurant.taxonomy?.shoyu, restaurant.taxonomy?.miso, restaurant.taxonomy?.tsukemen]
    .some((value) => ["yes", "no"].includes(value)) || (restaurant.taxonomy?.servingStyles || []).length > 0;
  const servicesKnown = Object.entries(restaurant.services || {}).some(([field, value]) => (
    !["confidence", "verifiedAt", "evidenceRefs"].includes(field) && ["yes", "no"].includes(value)
  ));
  const facts = {
    identity: restaurant.publication?.gates?.identity === "yes",
    relevance: ["primary", "substantial"].includes(restaurant.relevance?.classification) && hasAnyEvidence(restaurant.relevance?.evidenceRefs),
    menu: restaurant.menu?.status === "verified_current" && restaurant.menu?.itemCount > 0 && hasOfficialEvidence(restaurant.menu?.evidenceRefs),
    hours: DAYS.every((day) => restaurant.hours?.[day]) && hasAnyEvidence(restaurant.hours?.evidenceRefs),
    lateNight: restaurant.hours?.lateNightStatus !== "unknown" && hasAnyEvidence(restaurant.hours?.evidenceRefs),
    taxonomy: taxonomyKnown && hasOfficialEvidence(restaurant.taxonomy?.evidenceRefs),
    prices: restaurant.prices?.observedCount > 0 && hasOfficialEvidence(restaurant.prices?.evidenceRefs),
    vegan: restaurant.vegan?.status !== "unknown" && hasOfficialEvidence(restaurant.vegan?.evidenceRefs),
    noodles: restaurant.noodles?.status !== "unknown" && hasOfficialEvidence(restaurant.noodles?.evidenceRefs),
    reservations: restaurant.reservations?.status !== "unknown" && hasAnyEvidence(restaurant.reservations?.evidenceRefs),
    services: servicesKnown && hasAnyEvidence(restaurant.services?.evidenceRefs),
  };
  const evidenceStrong = (restaurant.evidence || []).length >= 2
    && (restaurant.evidence || []).some((evidence) => OFFICIAL_SOURCE_TYPES.has(evidence.sourceType) && /^[a-f0-9]{64}$/.test(evidence.contentHash || ""));
  const originalContent = publisherContentWordCount(restaurant) >= 200 && restaurant.publication?.gates?.originality === "yes";
  const nextReviewDue = Date.parse(restaurant.nextReviewDue || "");
  const fresh = Number.isFinite(nextReviewDue) && nextReviewDue >= now;
  let qualityScore = 0;
  if (facts.identity) qualityScore += 15;
  if (facts.relevance) qualityScore += 15;
  if (facts.menu) qualityScore += 15;
  if (facts.hours) qualityScore += 10;
  if (facts.taxonomy) qualityScore += 10;
  if (evidenceStrong) qualityScore += 10;
  if (originalContent) qualityScore += 10;
  if (fresh) qualityScore += 5;
  if (facts.prices) qualityScore += 5;
  if (facts.vegan) qualityScore += 1;
  if (facts.noodles) qualityScore += 1;
  if (facts.reservations) qualityScore += 1;
  if (facts.services) qualityScore += 1;
  return {
    facts,
    decisionFieldCount: Object.values(facts).filter(Boolean).length,
    qualityScore: Math.min(qualityScore, 100),
    evidenceStrong,
    originalContent,
    fresh,
  };
}
