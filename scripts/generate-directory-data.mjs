import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { passesPublicationGate, passesSiteLaunchGate } from "../lib/publication-policy.js";
import { deriveSearchReadinessProfile } from "../lib/search-readiness-profile.js";
import { applySearchReadinessEnrichment, validateSearchReadinessEnrichments } from "../lib/search-readiness-enrichments.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const sourcePath = path.resolve(siteRoot, "../outputs/ramen_directory_enrichment_20260824/ramen_restaurants_canada_enriched.csv");
const additionsPath = path.join(siteRoot, "data/curated-additions.csv");
const additionsSourcePath = path.join(siteRoot, "data/curated-additions.source.json");
const placeRegistryPath = path.join(siteRoot, "data/curated-place-registry.json");
const approvalsPath = path.join(siteRoot, "data/publication-approvals.json");
const readinessSupplementsPath = path.join(siteRoot, "data/search-readiness-supplements.json");
const readinessEnrichmentsPath = path.join(siteRoot, "data/search-readiness-menu-enrichments.json");
const rendererContractPaths = [
  "app/restaurants/[province]/[city]/[slug]/page.tsx",
  "app/layout.tsx",
  "app/globals.css",
  "components/Breadcrumbs.tsx",
  "components/FactBadge.tsx",
  "components/RestaurantList.tsx",
  "components/RestaurantCard.tsx",
  "components/SiteHeader.tsx",
  "components/SiteFooter.tsx",
  "components/Logo.tsx",
  "components/SiteLink.tsx",
  "lib/adsense.ts",
  "lib/directory.ts",
  "lib/format.ts",
  "lib/search-readiness.js",
  "lib/search-readiness-profile.js",
  "lib/site.ts",
];
const outputPath = path.join(siteRoot, "data/restaurants.json");
const summaryPath = path.join(siteRoot, "data/directory-summary.json");
const searchPath = path.join(siteRoot, "public/data/search-index.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") {
      if (cell.endsWith("\r")) cell = cell.slice(0, -1);
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function rowsFromCsv(text, label) {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error(`${label} is empty.`);
  const headers = table[0];
  if (headers.length !== 378) throw new Error(`${label} must use the 378-column enrichment schema; found ${headers.length} columns.`);
  if (new Set(headers).size !== headers.length) throw new Error(`${label} contains duplicate column names.`);
  const dataRows = table.slice(1).filter((row) => row.some((cell) => cell !== ""));
  for (const [index, row] of dataRows.entries()) {
    if (row.length !== headers.length) {
      throw new Error(`${label} row ${index + 2} has ${row.length} cells; expected ${headers.length}.`);
    }
  }
  return { headers, rows: dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))) };
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:street|st)\b/g, "st")
    .replace(/\b(?:road|rd)\b/g, "rd")
    .replace(/\b(?:boulevard|boul|bd)\b/g, "blvd")
    .replace(/\b(?:avenue|ave)\b/g, "ave")
    .replace(/\b(?:drive|dr)\b/g, "dr")
    .replace(/\b(?:highway|hwy)\b/g, "hwy")
    .replace(/\b(?:trail|trl)\b/g, "trl")
    .replace(/\b(?:crescent|cres)\b/g, "cres")
    .replace(/\b(?:sainte|saint)\b/g, "saint")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactPostal(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function significantStreetTokens(value) {
  const stop = new Set(["st", "rue", "rd", "blvd", "ave", "dr", "hwy", "trl", "cres", "unit", "suite", "local", "floor", "west", "east", "north", "south", "ouest", "est", "nord", "sud", "w", "e", "n", "s", "o"]);
  return normalizedText(value).split(" ").filter((token) => token && !stop.has(token) && !/^\d+[a-z]?$/.test(token));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

const canonicalSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://ramenscout.ca").replace(/\/$/, "");
let canonicalSite;
try {
  canonicalSite = new URL(canonicalSiteUrl);
} catch {
  throw new Error("NEXT_PUBLIC_SITE_URL must be a valid absolute URL before publication records can be generated.");
}
if (!canonicalSite.hostname || !["http:", "https:"].includes(canonicalSite.protocol)) {
  throw new Error("NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS and include a hostname before publication records can be generated.");
}
const rendererContractSources = await Promise.all(rendererContractPaths.map(async (relativePath) => ({
  path: relativePath,
  source: await fs.readFile(path.join(siteRoot, relativePath), "utf8"),
})));
const rendererHash = sha256(JSON.stringify({
  contractVersion: "restaurant-listing-renderer-v1",
  sources: rendererContractSources,
  canonicalSiteUrl,
  canonicalOrigin: canonicalSite.origin,
  canonicalHostname: canonicalSite.hostname,
}));

const split = (value) => String(value || "").split("|").map((part) => part.trim()).filter(Boolean);
const number = (value) => value === "" || value === null || value === undefined ? null : Number(value);
const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== "" && value !== null && value !== undefined));

const baseTable = rowsFromCsv(await fs.readFile(sourcePath, "utf8"), "Master enrichment CSV");
let additionsTable = { headers: baseTable.headers, rows: [] };
try {
  additionsTable = rowsFromCsv(await fs.readFile(additionsPath, "utf8"), "Curated additions CSV");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (additionsTable.headers.some((header, index) => header !== baseTable.headers[index])) {
  throw new Error("Curated additions CSV header does not exactly match the master enrichment CSV.");
}
const rawRows = [...baseTable.rows, ...additionsTable.rows];
const curatedSource = JSON.parse(await fs.readFile(additionsSourcePath, "utf8"));
if (curatedSource.policyVersion !== "curated-additions-v1" || !Array.isArray(curatedSource.restaurants)) throw new Error("Curated additions source has an unsupported schema.");
const curatedSourceByKey = new Map(curatedSource.restaurants.map((restaurant) => [restaurant.sourceKey, restaurant]));
if (curatedSourceByKey.size !== curatedSource.restaurants.length || curatedSource.restaurants.length !== additionsTable.rows.length) {
  throw new Error("Curated additions source and exact-schema overlay must have one unique record per candidate.");
}
const placeRegistry = JSON.parse(await fs.readFile(placeRegistryPath, "utf8"));
if (placeRegistry.schemaVersion !== "1.0" || !Array.isArray(placeRegistry.records)) throw new Error("Curated place registry has an unsupported schema.");
const registeredPlaces = new Map(placeRegistry.records.map((record) => [record.candidateKey, record]));
if (registeredPlaces.size !== placeRegistry.records.length) throw new Error("Curated place registry contains duplicate candidate keys.");
const approvalRegistry = JSON.parse(await fs.readFile(approvalsPath, "utf8"));
if (approvalRegistry.schemaVersion !== "1.0" || !Array.isArray(approvalRegistry.approvals)) throw new Error("Publication approval registry has an unsupported schema.");
const approvalById = new Map(approvalRegistry.approvals.map((approval) => [approval.restaurantId, approval]));
if (approvalById.size !== approvalRegistry.approvals.length) throw new Error("Publication approval registry contains duplicate restaurant IDs.");
const readinessSupplements = JSON.parse(await fs.readFile(readinessSupplementsPath, "utf8"));
if (readinessSupplements.schemaVersion !== "1.0" || !Array.isArray(readinessSupplements.records) || !Array.isArray(readinessSupplements.rejected)) {
  throw new Error("Search-readiness supplements have an unsupported schema.");
}
const readinessSupplementById = new Map(readinessSupplements.records.map((record) => [record.restaurantId, record]));
if (readinessSupplementById.size !== readinessSupplements.records.length) throw new Error("Search-readiness supplements contain duplicate restaurant IDs.");
const readinessEnrichmentById = validateSearchReadinessEnrichments(JSON.parse(await fs.readFile(readinessEnrichmentsPath, "utf8")));

for (const row of additionsTable.rows) {
  const required = ["restaurant_id", "source_google_place_id", "name", "canonical_path", "street_address", "city", "province_code", "postal_code", "latitude", "longitude", "official_location_url", "menu_url", "google_maps_url"];
  const missing = required.filter((field) => !row[field]);
  if (missing.length) throw new Error(`Curated addition ${row.name || row.restaurant_id || "(unknown)"} is missing: ${missing.join(", ")}.`);
  if (!/^ChIJ[A-Za-z0-9_-]+$/.test(row.source_google_place_id)) throw new Error(`Curated addition ${row.name} requires an authentic ChIJ Google Place ID.`);
  if (!/^\/restaurants\/[a-z]{2}\/[a-z0-9-]+\/[a-z0-9-]+$/.test(row.canonical_path)) throw new Error(`Curated addition ${row.name} has an invalid canonical path.`);
  const mapsUrl = new URL(row.google_maps_url);
  if (mapsUrl.protocol !== "https:" || !["google.com", "www.google.com"].includes(mapsUrl.hostname) || mapsUrl.pathname !== "/maps/search/") {
    throw new Error(`Curated addition ${row.name} requires an HTTPS Google Maps search URL.`);
  }
  const mapsPlaceId = mapsUrl.searchParams.get("query_place_id");
  if (mapsPlaceId !== row.source_google_place_id) throw new Error(`Curated addition ${row.name} Maps URL does not match its source Google Place ID.`);
  const registeredPlace = registeredPlaces.get(row.source_row_number);
  if (!registeredPlace) throw new Error(`Curated addition ${row.name} is absent from the independently checked place registry.`);
  if (registeredPlace.googlePlaceId !== row.source_google_place_id || registeredPlace.mapsUrl !== row.google_maps_url) {
    throw new Error(`Curated addition ${row.name} does not exactly match its checked place-registry identity.`);
  }
  const rowLatitude = Number(row.latitude);
  const rowLongitude = Number(row.longitude);
  const registryLatitude = Number(registeredPlace.latitude);
  const registryLongitude = Number(registeredPlace.longitude);
  if (![rowLatitude, rowLongitude, registryLatitude, registryLongitude].every(Number.isFinite)) {
    throw new Error(`Curated addition ${row.name} and its checked place-registry record require finite coordinates.`);
  }
  if (Math.abs(rowLatitude - registryLatitude) > 0.00001 || Math.abs(rowLongitude - registryLongitude) > 0.00001) {
    throw new Error(`Curated addition ${row.name} coordinates do not match the checked place registry.`);
  }
  const normalizedRowName = normalizedText(row.name);
  const normalizedMapsName = normalizedText(registeredPlace.mapsName);
  if (!(normalizedRowName === normalizedMapsName || normalizedRowName.includes(normalizedMapsName) || normalizedMapsName.includes(normalizedRowName))) {
    throw new Error(`Curated addition ${row.name} name does not match the checked Maps identity.`);
  }
  const normalizedMapsAddress = normalizedText(registeredPlace.mapsAddress);
  if (!normalizedMapsAddress.includes(normalizedText(row.city))) throw new Error(`Curated addition ${row.name} city does not match the checked Maps address.`);
  const provinceNames = { AB: "alberta", BC: "british columbia", MB: "manitoba", NB: "new brunswick", NL: "newfoundland and labrador", NS: "nova scotia", NT: "northwest territories", NU: "nunavut", ON: "ontario", PE: "prince edward island", QC: "quebec", SK: "saskatchewan", YT: "yukon" };
  if (![normalizedText(row.province_code), provinceNames[row.province_code]].some((province) => province && normalizedMapsAddress.includes(province))) {
    throw new Error(`Curated addition ${row.name} province does not match the checked Maps address.`);
  }
  if (!compactPostal(registeredPlace.mapsAddress).includes(compactPostal(row.postal_code))) throw new Error(`Curated addition ${row.name} postal code does not match the checked Maps address.`);
  const streetNumber = row.street_address.match(/\d+/)?.[0];
  if (streetNumber && !new RegExp(`(?:^|\\D)${streetNumber}(?:\\D|$)`).test(registeredPlace.mapsAddress)) {
    throw new Error(`Curated addition ${row.name} street number does not match the checked Maps address.`);
  }
  const mapsAddressTokens = new Set(normalizedMapsAddress.split(" "));
  const streetTokens = significantStreetTokens(row.street_address);
  if (!streetTokens.length || streetTokens.some((token) => !mapsAddressTokens.has(token))) {
    throw new Error(`Curated addition ${row.name} street name does not match the checked Maps address.`);
  }
  if (row.publication_status !== "needs_review" || row.robots_directive !== "noindex,follow" || row.ads_allowed !== "no") {
    throw new Error(`Curated addition ${row.name} must remain needs_review, noindex,follow and ad-disabled.`);
  }
  if (!["primary", "substantial"].includes(row.ramen_relevance) || row.menu_status !== "verified_current") {
    throw new Error(`Curated addition ${row.name} does not meet the ramen relevance and current-menu admission gate.`);
  }
  if (Number(row.publisher_content_word_count) < 200 || row.copy_qa_status !== "pass") {
    throw new Error(`Curated addition ${row.name} does not meet the 200-word original-content gate.`);
  }
  if (Number(row.quality_score_0_100) < 90 || Number(row.verified_decision_field_count) < 6) {
    throw new Error(`Curated addition ${row.name} does not meet the deterministic quality and decision-data gate.`);
  }
  const triStateFields = ["has_tonkotsu", "has_shoyu", "has_miso", "has_tsukemen"];
  if (triStateFields.some((field) => !["yes", "no", "unknown"].includes(row[field]))) throw new Error(`Curated addition ${row.name} has an invalid ramen taxonomy state.`);
}

const draftRestaurants = rawRows.map((row) => {
  const pathParts = row.canonical_path.split("/").filter(Boolean);
  const signatureItems = [1, 2, 3].map((itemNumber) => compact({
    name: row[`signature_${itemNumber}_name`],
    price: number(row[`signature_${itemNumber}_price_cad`]),
    brothBase: split(row[`signature_${itemNumber}_broth_base`]),
    brothStyle: split(row[`signature_${itemNumber}_broth_style`]),
    tare: split(row[`signature_${itemNumber}_tare`]),
    servingStyle: split(row[`signature_${itemNumber}_serving_style`]),
    dietary: split(row[`signature_${itemNumber}_dietary_tags`]),
    evidenceRefs: split(row[`signature_${itemNumber}_evidence_refs`]),
  })).filter((item) => item.name);
  const curatedCandidate = curatedSourceByKey.get(row.source_row_number);
  const items = curatedCandidate
    ? curatedCandidate.menu.items.map((item) => compact({
      name: item.name,
      price: number(item.price),
      brothBase: item.brothBase || [],
      brothStyle: item.brothStyle || [],
      tare: item.tare || [],
      servingStyle: item.servingStyle || [],
      dietary: item.dietary || [],
      evidenceRefs: item.evidenceRefs || [],
    }))
    : signatureItems;
  const faqs = [1, 2, 3, 4].map((faqNumber) => compact({
    question: row[`faq_${faqNumber}_question`],
    answer: row[`faq_${faqNumber}_answer`],
    evidenceRefs: split(row[`faq_${faqNumber}_evidence_refs`]),
    verifiedAt: row[`faq_${faqNumber}_verified_at`],
  })).filter((faq) => faq.question && faq.answer);
  const evidence = Array.from({ length: 12 }, (_, index) => index + 1).map((slot) => compact({
    id: `E${slot}`,
    url: row[`evidence_${slot}_url`],
    sourceType: row[`evidence_${slot}_source_type`],
    publisher: row[`evidence_${slot}_publisher`],
    retrievedAt: row[`evidence_${slot}_retrieved_at`],
    effectiveDate: row[`evidence_${slot}_effective_date`],
    supports: split(row[`evidence_${slot}_supports_fields`]),
    contentHash: row[`evidence_${slot}_content_hash`],
  })).filter((item) => item.url || item.sourceType);

  return {
    id: row.restaurant_id,
    // Preserve older base records that lack a Google Place ID. Curated
    // additions are validated above and always carry an independently checked ID.
    placeId: row.source_google_place_id || row.restaurant_id,
    name: row.name,
    alternateNames: split(row.alternate_names),
    brandName: row.brand_name,
    branchName: row.branch_name,
    slug: row.slug,
    canonicalPath: row.canonical_path,
    provinceSlug: pathParts[1] || row.province_code.toLowerCase(),
    citySlug: pathParts[2] || slugify(row.city),
    publication: {
      status: row.publication_status,
      robots: row.robots_directive,
      adsAllowed: row.ads_allowed,
      gateStatus: row.gate_status,
      failCodes: split(row.gate_fail_codes),
      qualityScore: number(row.quality_score_0_100) || 0,
      verifiedDecisionFieldCount: number(row.verified_decision_field_count) || 0,
      humanReviewedAt: row.human_reviewed_at,
      gates: {
        identity: row.gate_identity_pass,
        relevance: row.gate_relevance_pass,
        freshness: row.gate_freshness_pass,
        decisionData: row.gate_decision_data_pass,
        evidence: row.gate_evidence_pass,
        originality: row.gate_originality_pass,
        schema: row.gate_schema_pass,
        visibleSchemaParity: row.gate_visible_schema_parity_pass,
        rights: row.gate_rights_pass,
        humanReview: row.gate_human_review_pass,
        adsenseContent: row.gate_adsense_content_pass,
      },
    },
    contact: compact({
      phone: row.phone_e164,
      website: row.official_website_url,
      locationUrl: row.official_location_url,
      menuUrl: row.official_menu_url,
      reservationUrl: row.official_reservation_url || row.reservation_url,
      orderUrl: row.official_order_url,
      mapsUrl: row.google_maps_url,
    }),
    location: {
      street: row.street_address,
      neighbourhood: row.neighbourhood,
      city: row.city,
      provinceName: row.province_name,
      provinceCode: row.province_code,
      postalCode: row.postal_code,
      countryCode: row.country_code,
      latitude: number(row.latitude),
      longitude: number(row.longitude),
      timezone: row.timezone,
      parking: split(row.parking_summary),
    },
    relevance: {
      classification: row.ramen_relevance,
      itemCount: number(row.permanent_ramen_item_count) || 0,
      reason: row.ramen_relevance_reason,
      verifiedAt: row.relevance_verified_at,
      confidence: row.relevance_confidence,
      evidenceRefs: split(row.relevance_evidence_refs),
    },
    hours: {
      Monday: row.hours_mon,
      Tuesday: row.hours_tue,
      Wednesday: row.hours_wed,
      Thursday: row.hours_thu,
      Friday: row.hours_fri,
      Saturday: row.hours_sat,
      Sunday: row.hours_sun,
      verifiedAt: row.hours_verified_at,
      confidence: row.hours_confidence,
      lateNightStatus: row.late_night_status,
      lateNightDays: split(row.late_night_days),
      latestClose: row.late_night_latest_close,
      evidenceRefs: split(row.hours_evidence_refs),
    },
    menu: {
      status: row.menu_status,
      url: row.menu_url,
      sourceType: row.menu_source_type,
      verifiedAt: row.menu_verified_at,
      confidence: row.menu_confidence,
      itemCount: number(row.permanent_ramen_item_count) || 0,
      items,
      evidenceRefs: split(row.menu_evidence_refs),
    },
    taxonomy: {
      brothBases: split(row.broth_base_values),
      brothStyles: split(row.broth_style_values),
      tares: split(row.tare_values),
      servingStyles: split(row.serving_style_values),
      tonkotsu: row.has_tonkotsu,
      shoyu: row.has_shoyu,
      miso: row.has_miso,
      tsukemen: row.has_tsukemen,
      verifiedAt: row.taxonomy_verified_at,
      confidence: row.taxonomy_confidence,
      evidenceRefs: split(row.taxonomy_evidence_refs),
    },
    vegan: {
      status: row.vegan_status,
      bowlCount: number(row.vegan_complete_bowl_count),
      customizationRequired: row.vegan_customization_required,
      itemNames: split(row.vegan_item_names),
      note: row.vegan_cross_contact_note,
      verifiedAt: row.vegan_verified_at,
      confidence: row.vegan_confidence,
      evidenceRefs: split(row.vegan_evidence_refs),
    },
    halal: {
      status: row.halal_status,
      verifiedOptions: row.verified_halal_options,
      scope: row.halal_scope,
      certifier: row.halal_certifier_name,
      sourceType: row.halal_source_type,
      note: row.halal_notes,
      verifiedAt: row.halal_verified_at,
      confidence: row.halal_confidence,
      evidenceRefs: split(row.halal_evidence_refs),
    },
    noodles: {
      status: row.house_made_noodles_status,
      verified: row.house_made_noodles_verified,
      scope: row.house_made_noodles_scope,
      makingLocation: row.noodle_making_location,
      styleValues: split(row.noodle_style_values),
      verifiedAt: row.noodles_verified_at,
      confidence: row.noodles_confidence,
      evidenceRefs: split(row.noodles_evidence_refs),
    },
    prices: {
      currency: row.currency,
      observedCount: number(row.ramen_price_observed_item_count) || 0,
      min: number(row.ramen_price_min_cad),
      max: number(row.ramen_price_max_cad),
      median: number(row.ramen_price_median_cad),
      typical: number(row.typical_bowl_price_cad),
      band: row.price_band,
      verifiedAt: row.price_verified_at,
      confidence: row.price_confidence,
      evidenceRefs: split(row.price_evidence_refs),
    },
    reservations: {
      status: row.reservations_status,
      channels: split(row.reservation_channels),
      url: row.reservation_url,
      note: row.reservation_notes,
      verifiedAt: row.reservations_verified_at,
      confidence: row.reservations_confidence,
      evidenceRefs: split(row.reservations_evidence_refs),
    },
    services: {
      dineIn: row.dine_in_status,
      takeout: row.takeout_status,
      delivery: row.delivery_status,
      outdoorSeating: row.outdoor_seating_status,
      wheelchairEntrance: row.wheelchair_entrance_status,
      wheelchairSeating: row.wheelchair_seating_status,
      wheelchairWashroom: row.wheelchair_washroom_status,
      familyFriendly: row.family_friendly_status,
      alcohol: row.alcohol_status,
      verifiedAt: row.service_verified_at,
      confidence: row.service_confidence,
      evidenceRefs: split(row.service_evidence_refs),
    },
    content: {
      shortDescription: row.short_description,
      editorialDescription: row.editorial_description,
      whyGo: row.why_go,
      whatToOrder: row.what_to_order,
      bestFor: row.best_for,
      visitTips: row.visit_tips,
      neighbourhoodContext: row.neighbourhood_context,
      caveats: row.limitations_caveats,
      faqs,
    },
    seo: {
      title: row.seo_title,
      description: row.meta_description,
      h1: row.h1,
      primaryKeyword: row.listing_primary_keyword,
      topics: split(row.supported_keyword_topics),
      breadcrumbLabel: row.breadcrumb_label,
      ogTitle: row.og_title,
      ogDescription: row.og_description,
    },
    evidence,
    refreshedAt: row.enriched_at,
    nextReviewDue: row.next_review_due,
  };
});

const maximumSupplementAgeMs = 120 * 24 * 60 * 60 * 1000;
const currentBuildTime = Date.now();
const enrichedDraftRestaurants = draftRestaurants.map((restaurant) => applySearchReadinessEnrichment(
  restaurant,
  readinessEnrichmentById.get(restaurant.id),
  { allowPendingSupplementEvidence: true },
));
for (const restaurantId of readinessEnrichmentById.keys()) {
  if (!draftRestaurants.some((restaurant) => restaurant.id === restaurantId)) throw new Error(`Search-readiness menu enrichment references unknown restaurant ID ${restaurantId}.`);
}
const supplementedDraftRestaurants = enrichedDraftRestaurants.map((restaurant) => {
  const supplement = readinessSupplementById.get(restaurant.id);
  const enrichment = readinessEnrichmentById.get(restaurant.id);
  const enrichmentReferences = enrichment ? [
    ...enrichment.items.flatMap((item) => item.evidenceRefs || []),
    ...(enrichment.prices?.evidenceRefs || []),
    ...(enrichment.vegan?.evidenceRefs || []),
    ...(enrichment.taxonomy?.evidenceRefs || []),
    ...(enrichment.noodles?.evidenceRefs || []),
  ] : [];
  if (!supplement) {
    if (enrichmentReferences.includes("SR1")) throw new Error(`Search-readiness enrichment for ${restaurant.name} requires a matching fresh supplement.`);
    return restaurant;
  }
  const retrievedAt = Date.parse(supplement.retrievedAt || "");
  if (supplement.crawl4aiSuccess !== true || !["crawl4ai_normalized_markdown", "crawl4ai_page_plus_verified_document"].includes(supplement.extractionMethod)) {
    throw new Error(`Search-readiness supplement for ${restaurant.name} is not a successful normalized Crawl4AI capture.`);
  }
  if (supplement.url !== restaurant.menu.url) throw new Error(`Search-readiness supplement for ${restaurant.name} does not match its current menu URL.`);
  if (!/^https:\/\//i.test(supplement.finalUrl || "") || !Number.isInteger(supplement.statusCode) || supplement.statusCode < 200 || supplement.statusCode >= 400) {
    throw new Error(`Search-readiness supplement for ${restaurant.name} does not resolve to a usable HTTPS menu page.`);
  }
  if (!/^[a-f0-9]{64}$/.test(supplement.contentHash || "") || !Number.isInteger(supplement.markdownChars) || supplement.markdownChars < 200) {
    throw new Error(`Search-readiness supplement for ${restaurant.name} lacks a substantial hashed menu capture.`);
  }
  if (!/^[a-f0-9]{64}$/.test(supplement.pageContentHash || "")) {
    throw new Error(`Search-readiness supplement for ${restaurant.name} lacks its normalized page hash.`);
  }
  const documentBacked = supplement.extractionMethod === "crawl4ai_page_plus_verified_document";
  if (documentBacked && (!Array.isArray(supplement.linkedDocuments) || !supplement.linkedDocuments.length || supplement.linkedDocuments.some((document) => (
    !/^https:\/\//i.test(document.url || "")
    || !/^https:\/\//i.test(document.finalUrl || "")
    || !/^(?:image\/|application\/pdf$)/.test(document.contentType || "")
    || !Number.isInteger(document.bytes)
    || document.bytes < 1_000
    || !/^[a-f0-9]{64}$/.test(document.contentHash || "")
  )))) {
    throw new Error(`Search-readiness supplement for ${restaurant.name} has invalid linked menu-document evidence.`);
  }
  if (!documentBacked && (supplement.linkedDocuments || []).length) {
    throw new Error(`Search-readiness supplement for ${restaurant.name} attaches documents to the wrong extraction method.`);
  }
  const expectedContentHash = documentBacked
    ? sha256(JSON.stringify({ pageContentHash: supplement.pageContentHash, linkedDocuments: supplement.linkedDocuments }))
    : supplement.pageContentHash;
  if (supplement.contentHash !== expectedContentHash) {
    throw new Error(`Search-readiness supplement for ${restaurant.name} is detached from its page or linked-document hashes.`);
  }
  if (!Number.isFinite(retrievedAt) || retrievedAt > currentBuildTime + 5 * 60 * 1000 || currentBuildTime - retrievedAt > maximumSupplementAgeMs) {
    throw new Error(`Search-readiness supplement for ${restaurant.name} is stale or has an invalid retrieval time.`);
  }
  if ((supplement.corroboration?.ramenTerms || 0) < (documentBacked ? 1 : 2) || !(
    (supplement.corroboration?.matchedItems || 0) >= 1
    || (supplement.corroboration?.priceSignals || 0) >= 2
    || documentBacked
  )) {
    throw new Error(`Search-readiness supplement for ${restaurant.name} does not sufficiently corroborate a ramen menu.`);
  }
  const evidenceId = "SR1";
  if (restaurant.evidence.some((evidence) => evidence.id === evidenceId)) throw new Error(`Search-readiness evidence ID collision for ${restaurant.name}.`);
  const menuEvidenceRefs = [...new Set([...(restaurant.menu.evidenceRefs || []), evidenceId])];
  const menuItems = enrichment ? restaurant.menu.items.map((item) => ({ ...item, evidenceRefs: [...new Set([...(item.evidenceRefs || []), evidenceId])] })) : restaurant.menu.items;
  const prices = enrichment?.prices ? { ...restaurant.prices, verifiedAt: supplement.retrievedAt, evidenceRefs: [...new Set([...(restaurant.prices.evidenceRefs || []), evidenceId])] } : restaurant.prices;
  const vegan = enrichment?.vegan ? { ...restaurant.vegan, verifiedAt: supplement.retrievedAt, evidenceRefs: [...new Set([...(restaurant.vegan.evidenceRefs || []), evidenceId])] } : restaurant.vegan;
  const taxonomy = enrichment?.taxonomy ? { ...restaurant.taxonomy, verifiedAt: supplement.retrievedAt, evidenceRefs: [...new Set([...(restaurant.taxonomy.evidenceRefs || []), evidenceId])] } : restaurant.taxonomy;
  const noodles = enrichment?.noodles ? { ...restaurant.noodles, verifiedAt: supplement.retrievedAt, evidenceRefs: [...new Set([...(restaurant.noodles.evidenceRefs || []), evidenceId])] } : restaurant.noodles;
  const supplemented = {
    ...restaurant,
    publication: {
      ...restaurant.publication,
      searchReadinessSupplement: {
        verifiedAt: supplement.retrievedAt,
        url: supplement.url,
        finalUrl: supplement.finalUrl,
        extractionMethod: supplement.extractionMethod,
        contentHash: supplement.contentHash,
        pageContentHash: supplement.pageContentHash,
        statusCode: supplement.statusCode,
        markdownChars: supplement.markdownChars,
        linkedDocuments: supplement.linkedDocuments || [],
        crawl4aiSuccess: true,
        corroboration: supplement.corroboration,
        qualityScore: supplement.derivedQualityScore,
        verifiedDecisionFieldCount: supplement.derivedDecisionFieldCount,
        verifiedDecisionGroups: supplement.verifiedDecisionGroups,
      },
    },
    menu: { ...restaurant.menu, verifiedAt: supplement.retrievedAt, items: menuItems, evidenceRefs: menuEvidenceRefs },
    prices,
    vegan,
    taxonomy,
    noodles,
    evidence: [...restaurant.evidence, {
      id: evidenceId,
      url: supplement.url,
      sourceType: "official_menu",
      publisher: new URL(supplement.finalUrl).hostname,
      retrievedAt: supplement.retrievedAt,
      effectiveDate: supplement.retrievedAt.slice(0, 10),
      supports: [
        "menu_status",
        "menu_items",
        "menu_verification_date",
        "search_readiness_corroboration",
        ...(enrichment?.prices ? ["prices"] : []),
        ...(enrichment?.vegan ? ["vegan"] : []),
        ...(enrichment?.taxonomy ? ["taxonomy"] : []),
        ...(enrichment?.noodles ? ["noodles"] : []),
      ],
      contentHash: supplement.contentHash,
    }],
    refreshedAt: supplement.retrievedAt,
  };
  const profile = deriveSearchReadinessProfile(supplemented, currentBuildTime);
  const verifiedDecisionGroups = Object.entries(profile.facts).filter(([, verified]) => verified).map(([group]) => group).sort();
  if (profile.qualityScore !== supplement.derivedQualityScore
    || profile.decisionFieldCount !== supplement.derivedDecisionFieldCount
    || JSON.stringify(verifiedDecisionGroups) !== JSON.stringify([...(supplement.verifiedDecisionGroups || [])].sort())
    || profile.qualityScore < 90
    || profile.decisionFieldCount < 6) {
    throw new Error(`Search-readiness supplement for ${restaurant.name} does not match its independently derived current quality profile.`);
  }
  return supplemented;
});
for (const restaurantId of readinessSupplementById.keys()) {
  if (!enrichedDraftRestaurants.some((restaurant) => restaurant.id === restaurantId)) throw new Error(`Search-readiness supplement references unknown restaurant ID ${restaurantId}.`);
}

function approvalHashes(restaurant) {
  const contentHash = sha256(JSON.stringify({ content: restaurant.content, seo: restaurant.seo }));
  const evidenceHash = sha256(JSON.stringify(restaurant.evidence.map((evidence) => ({
    id: evidence.id,
    url: evidence.url,
    sourceType: evidence.sourceType,
    supports: evidence.supports,
    contentHash: evidence.contentHash,
  }))));
  const schemaHash = sha256(JSON.stringify({
    id: restaurant.id,
    canonicalPath: restaurant.canonicalPath,
    name: restaurant.name,
    contact: restaurant.contact,
    location: restaurant.location,
    hours: restaurant.hours,
    menu: restaurant.menu,
    taxonomy: restaurant.taxonomy,
    vegan: restaurant.vegan,
    halal: restaurant.halal,
    noodles: restaurant.noodles,
    prices: restaurant.prices,
    reservations: restaurant.reservations,
    services: restaurant.services,
  }));
  return { contentHash, evidenceHash, schemaHash, rendererHash };
}

function expectedApprovalHash(approval) {
  return sha256(JSON.stringify({
    restaurantId: approval.restaurantId,
    reviewerId: approval.reviewerId,
    reviewedAt: approval.reviewedAt,
    schemaValidatedAt: approval.schemaValidatedAt,
    visibleParityCheckedAt: approval.visibleParityCheckedAt,
    rightsReviewedAt: approval.rightsReviewedAt,
    contentHash: approval.contentHash,
    evidenceHash: approval.evidenceHash,
    schemaHash: approval.schemaHash,
    rendererHash: approval.rendererHash,
    approveIndexing: approval.approveIndexing,
    approveAds: approval.approveAds,
  }));
}

const restaurants = supplementedDraftRestaurants.map((restaurant) => {
  const hashes = approvalHashes(restaurant);
  const publication = { ...restaurant.publication, ...hashes };
  const approval = approvalById.get(restaurant.id);
  if (!approval) return { ...restaurant, publication };
  const now = Date.now();
  for (const field of ["reviewedAt", "schemaValidatedAt", "visibleParityCheckedAt", "rightsReviewedAt"]) {
    const timestamp = Date.parse(approval[field] || "");
    if (!Number.isFinite(timestamp) || timestamp > now) throw new Error(`Publication approval for ${restaurant.name} has an invalid ${field}.`);
  }
  if (typeof approval.reviewerId !== "string" || approval.reviewerId.trim().length < 3) throw new Error(`Publication approval for ${restaurant.name} requires a reviewer identity.`);
  for (const [field, value] of Object.entries(hashes)) {
    if (approval[field] !== value) throw new Error(`Publication approval for ${restaurant.name} is stale: ${field} does not match the current generated record.`);
  }
  if (approval.approvalHash !== expectedApprovalHash(approval)) throw new Error(`Publication approval for ${restaurant.name} has an invalid approval hash.`);
  if (approval.approveIndexing !== true || approval.approveAds !== true) throw new Error(`Publication approval for ${restaurant.name} must explicitly approve indexing and ads.`);
  return {
    ...restaurant,
    publication: {
      ...publication,
      status: "published",
      robots: "index,follow",
      adsAllowed: "yes",
      gateStatus: "pass",
      failCodes: [],
      humanReviewedAt: approval.reviewedAt,
      reviewerId: approval.reviewerId,
      approvalHash: approval.approvalHash,
      gates: Object.fromEntries(Object.keys(publication.gates).map((gate) => [gate, "yes"])),
    },
  };
});

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (!value) throw new Error(`${label} contains a blank value.`);
    if (seen.has(value)) throw new Error(`${label} contains a duplicate value: ${value}`);
    seen.add(value);
  }
}

assertUnique(restaurants.map((restaurant) => restaurant.id), "Restaurant IDs");
assertUnique(restaurants.map((restaurant) => restaurant.placeId), "Restaurant source identities");
assertUnique(restaurants.map((restaurant) => restaurant.canonicalPath), "Restaurant canonical paths");

const normalizedAddresses = restaurants.map((restaurant) => slugify(`${restaurant.name}-${restaurant.location.street}-${restaurant.location.postalCode}`));
assertUnique(normalizedAddresses, "Normalized restaurant name/address identities");
const normalizedStreetAddresses = restaurants.map((restaurant) => slugify(`${restaurant.location.street}-${restaurant.location.postalCode}`));
assertUnique(normalizedStreetAddresses, "Normalized restaurant street/unit/postal identities");

for (const restaurant of restaurants.slice(baseTable.rows.length)) {
  if (!Number.isFinite(restaurant.location.latitude) || !Number.isFinite(restaurant.location.longitude)) {
    throw new Error(`Curated addition ${restaurant.name} requires finite coordinates.`);
  }
  if (restaurant.location.latitude < 41 || restaurant.location.latitude > 84 || restaurant.location.longitude < -142 || restaurant.location.longitude > -52) {
    throw new Error(`Curated addition ${restaurant.name} has coordinates outside Canada-wide bounds.`);
  }
  const evidenceIds = new Set(restaurant.evidence.map((item) => item.id));
  if (restaurant.evidence.length < 2 || !restaurant.evidence.some((item) => item.url && ["official_menu", "official_site"].includes(item.sourceType))) {
    throw new Error(`Curated addition ${restaurant.name} requires at least two sources, including an official site or menu.`);
  }
  const evidenceRefs = [
    ...restaurant.relevance.evidenceRefs,
    ...restaurant.hours.evidenceRefs,
    ...restaurant.menu.evidenceRefs,
    ...restaurant.taxonomy.evidenceRefs,
    ...restaurant.vegan.evidenceRefs,
    ...restaurant.halal.evidenceRefs,
    ...restaurant.noodles.evidenceRefs,
    ...restaurant.prices.evidenceRefs,
    ...restaurant.reservations.evidenceRefs,
    ...restaurant.services.evidenceRefs,
    ...restaurant.menu.items.flatMap((item) => item.evidenceRefs || []),
    ...restaurant.content.faqs.flatMap((faq) => faq.evidenceRefs || []),
  ];
  const unresolved = [...new Set(evidenceRefs)].filter((reference) => !evidenceIds.has(reference));
  if (unresolved.length) throw new Error(`Curated addition ${restaurant.name} has unresolved evidence refs: ${unresolved.join(", ")}.`);
}

const indexingEnabled = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";
const approvedRestaurants = restaurants.filter((restaurant) => passesPublicationGate(restaurant, Date.now(), approvalById.get(restaurant.id)));
const directoryRestaurants = indexingEnabled ? approvedRestaurants : restaurants;
if (indexingEnabled && !passesSiteLaunchGate(approvedRestaurants)) {
  throw new Error("Indexing was requested, but the approved cohort does not pass the national launch gate (50 restaurants, 15 cities and 5 provinces). Keep NEXT_PUBLIC_ALLOW_INDEXING disabled until review coverage is sufficient.");
}

const provinceMap = new Map();
for (const restaurant of directoryRestaurants) {
  const provinceKey = restaurant.location.provinceCode;
  if (!provinceMap.has(provinceKey)) provinceMap.set(provinceKey, {
    code: provinceKey,
    slug: restaurant.provinceSlug,
    name: restaurant.location.provinceName,
    count: 0,
    cities: new Map(),
  });
  const province = provinceMap.get(provinceKey);
  province.count += 1;
  const cityKey = restaurant.citySlug;
  if (!province.cities.has(cityKey)) province.cities.set(cityKey, {
    name: restaurant.location.city,
    slug: restaurant.citySlug,
    count: 0,
    verifiedMenus: 0,
    pricedMenus: 0,
    lateNight: 0,
  });
  const city = province.cities.get(cityKey);
  city.count += 1;
  if (restaurant.menu.status === "verified_current") city.verifiedMenus += 1;
  if (restaurant.prices.observedCount > 0) city.pricedMenus += 1;
  if (restaurant.hours.lateNightStatus === "yes") city.lateNight += 1;
}

const provinces = [...provinceMap.values()].map((province) => ({
  ...province,
  cities: [...province.cities.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
})).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

const summary = {
  generatedAt: new Date().toISOString(),
  baseRestaurantCount: baseTable.rows.length,
  curatedAdditionCount: additionsTable.rows.length,
  restaurantCount: directoryRestaurants.length,
  provinceCount: provinces.length,
  cityCount: provinces.reduce((total, province) => total + province.cities.length, 0),
  verifiedMenuCount: directoryRestaurants.filter((restaurant) => restaurant.menu.status === "verified_current").length,
  pricedMenuCount: directoryRestaurants.filter((restaurant) => restaurant.prices.observedCount > 0).length,
  lateNightCount: directoryRestaurants.filter((restaurant) => restaurant.hours.lateNightStatus === "yes").length,
  reservationCount: directoryRestaurants.filter((restaurant) => ["accepted", "required"].includes(restaurant.reservations.status)).length,
  styleCounts: {
    tonkotsu: directoryRestaurants.filter((restaurant) => restaurant.taxonomy.tonkotsu === "yes").length,
    shoyu: directoryRestaurants.filter((restaurant) => restaurant.taxonomy.shoyu === "yes").length,
    miso: directoryRestaurants.filter((restaurant) => restaurant.taxonomy.miso === "yes").length,
    tsukemen: directoryRestaurants.filter((restaurant) => restaurant.taxonomy.tsukemen === "yes").length,
  },
  veganCompleteCount: directoryRestaurants.filter((restaurant) => ["one_complete_bowl", "multiple_complete_bowls"].includes(restaurant.vegan.status)).length,
  verifiedHalalCount: directoryRestaurants.filter((restaurant) => restaurant.halal.verifiedOptions === "yes").length,
  houseMadeNoodleCount: directoryRestaurants.filter((restaurant) => restaurant.noodles.status === "made_on_site").length,
  provinces,
};

const searchIndex = directoryRestaurants.map((restaurant) => ({
  id: restaurant.id,
  name: restaurant.name,
  alternateNames: restaurant.alternateNames,
  brandName: restaurant.brandName,
  branchName: restaurant.branchName,
  path: restaurant.canonicalPath,
  city: restaurant.location.city,
  citySlug: restaurant.citySlug,
  province: restaurant.location.provinceName,
  provinceCode: restaurant.location.provinceCode,
  neighbourhood: restaurant.location.neighbourhood,
  address: restaurant.location.street,
  postalCode: restaurant.location.postalCode,
  fsa: String(restaurant.location.postalCode || "").replace(/\s+/g, "").slice(0, 3).toUpperCase(),
  styles: [...new Set([
    ...(restaurant.taxonomy.tonkotsu === "yes" ? ["tonkotsu"] : []),
    ...(restaurant.taxonomy.shoyu === "yes" ? ["shoyu"] : []),
    ...(restaurant.taxonomy.miso === "yes" ? ["miso"] : []),
    ...(restaurant.taxonomy.tsukemen === "yes" ? ["tsukemen"] : []),
    ...restaurant.taxonomy.brothBases,
    ...restaurant.taxonomy.brothStyles,
    ...restaurant.taxonomy.tares,
    ...restaurant.taxonomy.servingStyles,
  ])],
  signatureItems: restaurant.menu.items.map((item) => item.name),
  latitude: restaurant.location.latitude,
  longitude: restaurant.location.longitude,
  description: restaurant.content.shortDescription,
  menuStatus: restaurant.menu.status,
  menuVerifiedAt: restaurant.menu.verifiedAt,
  priceMin: restaurant.prices.min,
  priceMax: restaurant.prices.max,
  priceBand: restaurant.prices.band,
  tonkotsu: restaurant.taxonomy.tonkotsu,
  shoyu: restaurant.taxonomy.shoyu,
  miso: restaurant.taxonomy.miso,
  tsukemen: restaurant.taxonomy.tsukemen,
  veganStatus: restaurant.vegan.status,
  halalVerified: restaurant.halal.verifiedOptions,
  noodlesStatus: restaurant.noodles.status,
  lateNight: restaurant.hours.lateNightStatus,
  reservations: restaurant.reservations.status,
})).sort((a, b) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city) || a.id.localeCompare(b.id));

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(searchPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(restaurants)}\n`, "utf8");
await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await fs.writeFile(searchPath, `${JSON.stringify(searchIndex)}\n`, "utf8");
console.log(JSON.stringify({ sourceRestaurants: restaurants.length, directoryRestaurants: directoryRestaurants.length, indexingEnabled, provinces: provinces.length, cities: summary.cityCount, outputPath, searchPath }, null, 2));
