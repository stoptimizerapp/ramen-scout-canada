import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const sourcePath = path.resolve(siteRoot, "../outputs/ramen_directory_enrichment_20260824/ramen_restaurants_canada_enriched.csv");
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

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const split = (value) => String(value || "").split("|").map((part) => part.trim()).filter(Boolean);
const number = (value) => value === "" || value === null || value === undefined ? null : Number(value);
const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== "" && value !== null && value !== undefined));

const table = parseCsv(await fs.readFile(sourcePath, "utf8"));
const headers = table[0];
const rawRows = table.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));

const restaurants = rawRows.map((row) => {
  const pathParts = row.canonical_path.split("/").filter(Boolean);
  const items = [1, 2, 3].map((itemNumber) => compact({
    name: row[`signature_${itemNumber}_name`],
    price: number(row[`signature_${itemNumber}_price_cad`]),
    brothBase: split(row[`signature_${itemNumber}_broth_base`]),
    brothStyle: split(row[`signature_${itemNumber}_broth_style`]),
    tare: split(row[`signature_${itemNumber}_tare`]),
    servingStyle: split(row[`signature_${itemNumber}_serving_style`]),
    dietary: split(row[`signature_${itemNumber}_dietary_tags`]),
    evidenceRefs: split(row[`signature_${itemNumber}_evidence_refs`]),
  })).filter((item) => item.name);
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
  })).filter((item) => item.url || item.sourceType);

  return {
    id: row.restaurant_id,
    placeId: row.source_google_place_id,
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

function isPublicationApproved(restaurant) {
  const hasOfficialEvidence = restaurant.evidence.some((item) => item.url && ["official_menu", "official_site"].includes(item.sourceType));
  const nextReviewDue = Date.parse(restaurant.nextReviewDue || "");
  return restaurant.publication.status === "published"
    && restaurant.publication.robots.startsWith("index")
    && restaurant.publication.adsAllowed === "yes"
    && restaurant.publication.gateStatus === "pass"
    && restaurant.publication.failCodes.length === 0
    && restaurant.publication.qualityScore >= 90
    && restaurant.publication.verifiedDecisionFieldCount >= 6
    && Boolean(restaurant.publication.humanReviewedAt)
    && Object.values(restaurant.publication.gates).every((value) => value === "yes")
    && ["primary", "substantial"].includes(restaurant.relevance.classification)
    && restaurant.menu.status === "verified_current"
    && restaurant.evidence.length >= 2
    && hasOfficialEvidence
    && Number.isFinite(nextReviewDue)
    && nextReviewDue >= Date.now();
}

const indexingEnabled = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";
const directoryRestaurants = indexingEnabled ? restaurants.filter(isPublicationApproved) : restaurants;
if (indexingEnabled && directoryRestaurants.length === 0) {
  throw new Error("Indexing was requested, but no restaurant passes the complete publication gate. Keep NEXT_PUBLIC_ALLOW_INDEXING disabled until human review is complete.");
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
  const cityKey = restaurant.location.city;
  if (!province.cities.has(cityKey)) province.cities.set(cityKey, {
    name: cityKey,
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
