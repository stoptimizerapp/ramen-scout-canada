const CONTENT_FIELDS = new Set([
  "shortDescription",
  "editorialDescription",
  "whyGo",
  "whatToOrder",
  "bestFor",
  "visitTips",
  "neighbourhoodContext",
  "caveats",
]);

const TRI_STATES = new Set(["yes", "no", "unknown"]);
const PENDING_SUPPLEMENT_EVIDENCE_ID = "SR1";

function validateEvidenceRefs(references, label) {
  if (!Array.isArray(references) || !references.length) throw new Error(`${label} requires evidence references.`);
  if (references.some((reference) => typeof reference !== "string" || !/^[A-Z][A-Z0-9]*\d+$/.test(reference))) {
    throw new Error(`${label} has an invalid evidence reference.`);
  }
}

function ensureHttps(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid URL.`); }
  if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
}

export function validateSearchReadinessEnrichments(payload) {
  if (payload?.schemaVersion !== "1.0" || !Array.isArray(payload.records)) throw new Error("Search-readiness menu enrichments have an unsupported schema.");
  const byId = new Map();
  for (const record of payload.records) {
    if (!record.restaurantId || byId.has(record.restaurantId)) throw new Error(`Search-readiness menu enrichment has a blank or duplicate restaurant ID: ${record.restaurantId || "(blank)"}.`);
    ensureHttps(record.replacesMenuUrl, `Previous menu URL for ${record.restaurantId}`);
    ensureHttps(record.menuUrl, `Current menu URL for ${record.restaurantId}`);
    if (record.linkedDocuments !== undefined) {
      if (!Array.isArray(record.linkedDocuments) || !record.linkedDocuments.length || new Set(record.linkedDocuments).size !== record.linkedDocuments.length) {
        throw new Error(`Menu enrichment for ${record.restaurantId} requires a non-empty, unique linked-document list.`);
      }
      for (const documentUrl of record.linkedDocuments) ensureHttps(documentUrl, `Linked menu document for ${record.restaurantId}`);
    }
    if (!Number.isInteger(record.permanentItemCount) || record.permanentItemCount < 1) throw new Error(`Menu enrichment for ${record.restaurantId} requires a positive permanent-item count.`);
    if (!Array.isArray(record.items) || !record.items.length || record.items.length > record.permanentItemCount) throw new Error(`Menu enrichment for ${record.restaurantId} requires representative menu items within its full count.`);
    const itemNames = new Set();
    for (const item of record.items) {
      if (typeof item.name !== "string" || item.name.trim().length < 3 || itemNames.has(item.name)) throw new Error(`Menu enrichment for ${record.restaurantId} has a blank or duplicate item name.`);
      itemNames.add(item.name);
      if (item.price !== undefined && (!Number.isFinite(item.price) || item.price <= 0)) throw new Error(`Menu enrichment for ${record.restaurantId} has an invalid item price.`);
      validateEvidenceRefs(item.evidenceRefs, `Menu enrichment item ${item.name}`);
    }
    const unexpectedContentFields = Object.keys(record.content || {}).filter((field) => !CONTENT_FIELDS.has(field));
    if (unexpectedContentFields.length) throw new Error(`Menu enrichment for ${record.restaurantId} has unsupported content fields: ${unexpectedContentFields.join(", ")}.`);
    for (const [field, value] of Object.entries(record.content || {})) {
      if (typeof value !== "string" || value.trim().length < 30) throw new Error(`Menu enrichment content field ${field} for ${record.restaurantId} is too short.`);
    }
    if (record.prices) {
      if (!Number.isInteger(record.prices.observedCount) || record.prices.observedCount < record.items.filter((item) => item.price !== undefined).length) throw new Error(`Menu enrichment for ${record.restaurantId} has an invalid observed-price count.`);
      for (const field of ["min", "max", "median", "typical"]) if (!Number.isFinite(record.prices[field]) || record.prices[field] <= 0) throw new Error(`Menu enrichment for ${record.restaurantId} has an invalid ${field} price.`);
      if (record.prices.min > record.prices.max) throw new Error(`Menu enrichment for ${record.restaurantId} has an inverted price range.`);
      validateEvidenceRefs(record.prices.evidenceRefs, `Menu enrichment prices for ${record.restaurantId}`);
    }
    if (record.taxonomy) {
      for (const field of ["brothBases", "brothStyles", "tares", "servingStyles"]) {
        if (!Array.isArray(record.taxonomy[field])) throw new Error(`Menu enrichment taxonomy ${field} for ${record.restaurantId} must be an array.`);
      }
      for (const field of ["tonkotsu", "shoyu", "miso", "tsukemen"]) {
        if (!TRI_STATES.has(record.taxonomy[field])) throw new Error(`Menu enrichment taxonomy ${field} for ${record.restaurantId} has an invalid state.`);
      }
      validateEvidenceRefs(record.taxonomy.evidenceRefs, `Menu enrichment taxonomy for ${record.restaurantId}`);
    }
    if (record.vegan) {
      validateEvidenceRefs(record.vegan.evidenceRefs, `Menu enrichment vegan facts for ${record.restaurantId}`);
    }
    if (record.noodles) {
      if (!TRI_STATES.has(record.noodles.verified)) throw new Error(`Menu enrichment noodle verification for ${record.restaurantId} has an invalid state.`);
      if (!Array.isArray(record.noodles.styleValues)) throw new Error(`Menu enrichment noodle styles for ${record.restaurantId} must be an array.`);
      validateEvidenceRefs(record.noodles.evidenceRefs, `Menu enrichment noodle facts for ${record.restaurantId}`);
    }
    byId.set(record.restaurantId, record);
  }
  return byId;
}

export function applySearchReadinessEnrichment(restaurant, enrichment, { allowPendingSupplementEvidence = false } = {}) {
  if (!enrichment) return restaurant;
  if (![enrichment.replacesMenuUrl, enrichment.menuUrl].includes(restaurant.menu?.url)) throw new Error(`Menu enrichment for ${restaurant.name} is stale: the previous menu URL changed.`);
  const evidenceIds = new Set((restaurant.evidence || []).map((evidence) => evidence.id));
  const references = [
    ...enrichment.items.flatMap((item) => item.evidenceRefs || []),
    ...(enrichment.prices?.evidenceRefs || []),
    ...(enrichment.vegan?.evidenceRefs || []),
    ...(enrichment.taxonomy?.evidenceRefs || []),
    ...(enrichment.noodles?.evidenceRefs || []),
  ];
  const unresolved = [...new Set(references)].filter((reference) => !evidenceIds.has(reference));
  const blockingUnresolved = unresolved.filter((reference) => !(allowPendingSupplementEvidence && reference === PENDING_SUPPLEMENT_EVIDENCE_ID));
  if (blockingUnresolved.length) throw new Error(`Menu enrichment for ${restaurant.name} has unresolved evidence refs: ${blockingUnresolved.join(", ")}.`);
  return {
    ...restaurant,
    contact: { ...restaurant.contact, menuUrl: enrichment.menuUrl },
    menu: {
      ...restaurant.menu,
      status: "verified_current",
      url: enrichment.menuUrl,
      sourceType: "official_menu",
      confidence: "high",
      itemCount: enrichment.permanentItemCount,
      items: enrichment.items,
      evidenceRefs: [...new Set([...(restaurant.menu.evidenceRefs || []), ...enrichment.items.flatMap((item) => item.evidenceRefs || [])])],
    },
    prices: enrichment.prices ? { ...restaurant.prices, ...enrichment.prices, currency: "CAD", confidence: "high" } : restaurant.prices,
    vegan: enrichment.vegan ? { ...restaurant.vegan, ...enrichment.vegan } : restaurant.vegan,
    taxonomy: enrichment.taxonomy ? { ...restaurant.taxonomy, ...enrichment.taxonomy, confidence: "high" } : restaurant.taxonomy,
    noodles: enrichment.noodles ? { ...restaurant.noodles, ...enrichment.noodles, confidence: "high" } : restaurant.noodles,
    content: { ...restaurant.content, ...(enrichment.content || {}) },
  };
}
