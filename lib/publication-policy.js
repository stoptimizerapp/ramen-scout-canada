const hashPattern = /^[a-f0-9]{64}$/;

function validPastTimestamp(value, now) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) && timestamp <= now;
}

/**
 * Complete publication predicate shared by generation and runtime routing.
 * A data-quality score or an unverified CSV flag can never make a page public.
 * @param {any} restaurant
 * @param {number} [now]
 * @param {any} [approval]
 */
export function passesPublicationGate(restaurant, now = Date.now(), approval = null) {
  const publication = restaurant?.publication || {};
  const hasOfficialEvidence = restaurant?.evidence?.some((item) => item.url
    && ["official_menu", "official_site"].includes(item.sourceType || "")
    && hashPattern.test(item.contentHash || ""));
  const nextReviewDue = Date.parse(restaurant?.nextReviewDue || "");
  const approvalMatches = approval
    && approval.restaurantId === restaurant.id
    && approval.reviewerId === publication.reviewerId
    && approval.reviewedAt === publication.humanReviewedAt
    && approval.approvalHash === publication.approvalHash
    && approval.contentHash === publication.contentHash
    && approval.evidenceHash === publication.evidenceHash
    && approval.schemaHash === publication.schemaHash
    && approval.rendererHash === publication.rendererHash
    && approval.approveIndexing === true
    && approval.approveAds === true
    && hashPattern.test(approval.approvalHash || "")
    && [approval.contentHash, approval.evidenceHash, approval.schemaHash, approval.rendererHash].every((hash) => hashPattern.test(hash || ""))
    && typeof approval.reviewerId === "string"
    && approval.reviewerId.trim().length >= 3
    && validPastTimestamp(approval.reviewedAt, now)
    && validPastTimestamp(approval.schemaValidatedAt, now)
    && validPastTimestamp(approval.visibleParityCheckedAt, now)
    && validPastTimestamp(approval.rightsReviewedAt, now);
  return Boolean(approvalMatches)
    && publication.status === "published"
    && publication.robots === "index,follow"
    && publication.adsAllowed === "yes"
    && publication.gateStatus === "pass"
    && publication.failCodes.length === 0
    && publication.qualityScore >= 90
    && publication.verifiedDecisionFieldCount >= 6
    && Object.values(publication.gates).every((value) => value === "yes")
    && ["primary", "substantial"].includes(restaurant.relevance.classification)
    && restaurant.menu.status === "verified_current"
    && restaurant.evidence.length >= 2
    && hasOfficialEvidence
    && Number.isFinite(nextReviewDue)
    && nextReviewDue >= now;
}

/** A national launch cannot be unlocked by a token approved cohort. */
export function passesSiteLaunchGate(restaurants) {
  if (restaurants.length < 50) return false;
  const cities = new Set(restaurants.map((restaurant) => `${restaurant.provinceSlug}:${restaurant.citySlug}`));
  const provinces = new Set(restaurants.map((restaurant) => restaurant.location.provinceCode));
  return cities.size >= 15 && provinces.size >= 5;
}
