import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const masterPath = path.resolve(siteRoot, "../outputs/ramen_directory_enrichment_20260824/ramen_restaurants_canada_enriched.csv");
const sourcePath = process.env.CURATED_ADDITIONS_SOURCE
  ? path.resolve(siteRoot, process.env.CURATED_ADDITIONS_SOURCE)
  : path.join(siteRoot, "data/curated-additions.source.json");
const outputPath = process.env.CURATED_ADDITIONS_OUTPUT
  ? path.resolve(siteRoot, process.env.CURATED_ADDITIONS_OUTPUT)
  : path.join(siteRoot, "data/curated-additions.csv");
const evidenceRegistryPath = process.env.CURATED_EVIDENCE_REGISTRY
  ? path.resolve(siteRoot, process.env.CURATED_EVIDENCE_REGISTRY)
  : path.join(siteRoot, "data/curated-evidence-registry.json");
const placeRegistryPath = path.join(siteRoot, "data/curated-place-registry.json");
const verificationDate = "2026-08-24";
const verificationTimestamp = "2026-08-24T00:00:00Z";
const nextReviewDue = "2026-11-22";
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
let evidenceRegistryByUrl = new Map();
let placeRegistryByKey = new Map();

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
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

function csvCell(value) {
  const text = Array.isArray(value) ? value.filter(Boolean).join("|") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function words(value) {
  return String(value || "").normalize("NFKC").match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? [];
}

function normalizedTokens(value) {
  return words(value).map((token) => token.toLocaleLowerCase("en-CA"));
}

function normalizedCopy(value) {
  return normalizedTokens(value).join(" ");
}

function ngrams(value, width = 5) {
  const tokens = normalizedTokens(value);
  const result = new Set();
  for (let index = 0; index <= tokens.length - width; index += 1) result.add(tokens.slice(index, index + width).join(" "));
  return result;
}

function jaccard(left, right) {
  if (!left.size && !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function sentences(value) {
  return String(value || "")
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9])/u)
    .map((sentence) => normalizedCopy(sentence))
    .filter((sentence) => words(sentence).length >= 8);
}

function longestCommonTokenRun(left, right) {
  const a = normalizedTokens(left);
  const b = normalizedTokens(right);
  let previous = new Uint16Array(b.length + 1);
  let longest = 0;
  for (let leftIndex = 1; leftIndex <= a.length; leftIndex += 1) {
    const current = new Uint16Array(b.length + 1);
    for (let rightIndex = 1; rightIndex <= b.length; rightIndex += 1) {
      if (a[leftIndex - 1] === b[rightIndex - 1]) {
        current[rightIndex] = previous[rightIndex - 1] + 1;
        longest = Math.max(longest, current[rightIndex]);
      }
    }
    previous = current;
  }
  return longest;
}

function parseHoursInterval(interval, forceNextDay = false) {
  const match = String(interval || "").match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})(\+1)?$/);
  if (!match) return null;
  const open = Number(match[1]) * 60 + Number(match[2]);
  const closeHour = Number(match[3]);
  const closeMinute = Number(match[4]);
  const isEndOfDay = closeHour === 24 && closeMinute === 0;
  const rawClose = isEndOfDay ? 0 : closeHour * 60 + closeMinute;
  if (open >= 24 * 60 || closeHour > 24 || closeMinute >= 60 || (closeHour === 24 && closeMinute !== 0)) return null;
  const nextDay = forceNextDay || Boolean(match[5]) || isEndOfDay || rawClose <= open;
  return {
    open,
    openText: `${match[1]}:${match[2]}`,
    rawClose,
    closeText: isEndOfDay ? "00:00" : `${match[3]}:${match[4]}`,
    close: rawClose + (nextDay ? 24 * 60 : 0),
    nextDay,
    normalized: `${match[1]}:${match[2]}-${isEndOfDay ? "00:00" : `${match[3]}:${match[4]}`}${nextDay ? "+1" : ""}`,
  };
}

function normalizeWeeklyHours(hours) {
  return Object.fromEntries(dayNames.map((day) => {
    const value = String(hours?.[day] || "unknown").trim().toLowerCase();
    if (["closed", "unknown"].includes(value)) return [day, value];
    let afterMidnightContinuation = false;
    const intervals = value.split("|").map((interval) => {
      const parsed = parseHoursInterval(interval, afterMidnightContinuation && interval.startsWith("00:"));
      if (parsed?.nextDay && parsed.rawClose === 0) afterMidnightContinuation = true;
      return parsed;
    });
    if (intervals.some((interval) => !interval)) throw new Error(`${day} has an invalid hours interval: ${hours?.[day]}`);
    const merged = [];
    for (const interval of intervals) {
      const previous = merged.at(-1);
      if (previous?.nextDay && previous.rawClose === 0 && interval.nextDay && interval.open === 0) {
        previous.rawClose = interval.rawClose;
        previous.closeText = interval.closeText;
        previous.close = interval.close;
        previous.normalized = `${previous.openText}-${interval.closeText}+1`;
      } else merged.push({ ...interval });
    }
    return [day, merged.map((interval) => interval.normalized).join("|")];
  }));
}

function deriveLateNight(hours) {
  const lateDays = [];
  let latest = null;
  let hasUnknownDay = false;
  for (const day of dayNames) {
    const value = hours[day];
    if (value === "unknown") { hasUnknownDay = true; continue; }
    if (value === "closed") continue;
    const intervals = value.split("|").map((interval) => parseHoursInterval(interval)).filter(Boolean);
    const lateIntervals = intervals.filter((interval) => interval.close >= 23 * 60);
    if (lateIntervals.length) lateDays.push(day);
    for (const interval of lateIntervals) {
      if (!latest || interval.close > latest.close) latest = interval;
    }
  }
  return {
    status: lateDays.length ? "yes" : hasUnknownDay ? "unknown" : "no",
    days: lateDays,
    latestClose: latest ? `${String(latest.rawClose / 60 | 0).padStart(2, "0")}:${String(latest.rawClose % 60).padStart(2, "0")}${latest.close >= 24 * 60 ? "+1" : ""}` : "",
  };
}

function priceBand(value) {
  if (!Number.isFinite(value)) return "";
  if (value < 15) return "budget";
  if (value <= 22) return "moderate";
  return "premium";
}

function evidenceRefs(candidate, ...supports) {
  const wanted = new Set(supports.flat());
  return candidate.evidence
    .filter((evidence) => evidence.supports.some((field) => wanted.has(field)))
    .map((evidence) => evidence.id);
}

function contentText(candidate) {
  return [
    candidate.content.shortDescription,
    candidate.content.editorialDescription,
    candidate.content.whyGo,
    candidate.content.whatToOrder,
    candidate.content.bestFor,
    candidate.content.visitTips,
    candidate.content.neighbourhoodContext,
    candidate.content.caveats,
    ...(candidate.content.faqs || []).flatMap((faq) => [faq.question, faq.answer]),
  ].filter(Boolean).join(" ");
}

function validateCandidate(candidate) {
  const label = `${candidate.name} (${candidate.branchName || candidate.location.city})`;
  const required = [
    [candidate.name, "name"], [candidate.branchName, "branchName"], [candidate.location?.street, "location.street"],
    [candidate.location?.city, "location.city"], [candidate.location?.provinceCode, "location.provinceCode"],
    [candidate.location?.postalCode, "location.postalCode"], [candidate.contact?.locationUrl, "contact.locationUrl"],
    [candidate.contact?.menuUrl, "contact.menuUrl"], [candidate.relevance?.reason, "relevance.reason"],
    [candidate.content?.shortDescription, "content.shortDescription"], [candidate.content?.editorialDescription, "content.editorialDescription"],
  ];
  const missing = required.filter(([value]) => !value).map(([, field]) => field);
  if (missing.length) throw new Error(`${label} is missing ${missing.join(", ")}.`);
  if (!Number.isFinite(candidate.location.latitude) || !Number.isFinite(candidate.location.longitude)) throw new Error(`${label} requires finite coordinates.`);
  if (!/^\+1\d{10}$/.test(candidate.contact.phone || "") && candidate.contact.phone) throw new Error(`${label} has an invalid Canadian E.164 phone.`);
  if (!/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(candidate.location.postalCode)) throw new Error(`${label} has an invalid Canadian postal code.`);
  if (!candidate.evidence?.length || candidate.evidence.length < 2) throw new Error(`${label} requires at least two evidence records.`);
  if (!candidate.evidence.some((evidence) => ["official_site", "official_menu"].includes(evidence.sourceType))) throw new Error(`${label} requires official evidence.`);
  const evidenceIds = candidate.evidence.map((evidence) => evidence.id);
  if (new Set(evidenceIds).size !== evidenceIds.length || evidenceIds.some((id, index) => id !== `E${index + 1}`)) throw new Error(`${label} evidence IDs must be unique and sequential from E1.`);
  if (candidate.evidence.some((evidence) => !evidence.url || !evidence.publisher || !evidence.retrievedAt || !evidence.supports?.length || !evidence.factsSnapshot)) throw new Error(`${label} has incomplete evidence provenance.`);
  const evidenceById = new Map(candidate.evidence.map((evidence) => [evidence.id, evidence]));
  if (!['primary', 'substantial'].includes(candidate.relevance.classification)) throw new Error(`${label} is not sufficiently ramen-relevant.`);
  if (!Number.isInteger(candidate.relevance.itemCount) || candidate.relevance.itemCount < 1) throw new Error(`${label} requires at least one permanent ramen item.`);
  if (dayNames.some((day) => !candidate.hours?.[day])) throw new Error(`${label} requires seven-day hours, using unknown only when an official source is defective.`);
  normalizeWeeklyHours(candidate.hours);
  if (!candidate.menu?.items?.length) throw new Error(`${label} requires decision-useful item-level menu facts.`);
  for (const item of candidate.menu.items) {
    if (!item.evidenceRefs?.length) throw new Error(`${label} menu item ${item.name} requires explicit evidence references.`);
    for (const reference of item.evidenceRefs) {
      const evidence = evidenceById.get(reference);
      if (!evidence) throw new Error(`${label} menu item ${item.name} references missing evidence ${reference}.`);
      if (!evidence.supports.includes("menu")) throw new Error(`${label} menu item ${item.name} references ${reference}, which does not support menu facts.`);
    }
  }
  for (const faq of candidate.content?.faqs || []) {
    if (!faq.evidenceRefs?.length) throw new Error(`${label} FAQ ${faq.question} requires explicit evidence references.`);
    for (const reference of faq.evidenceRefs) if (!evidenceById.has(reference)) throw new Error(`${label} FAQ ${faq.question} references missing evidence ${reference}.`);
  }
  const shortWords = words(candidate.content.shortDescription).length;
  const editorialWords = words(candidate.content.editorialDescription).length;
  const totalWords = words(contentText(candidate)).length;
  if (shortWords < 28 || shortWords > 45) throw new Error(`${label} short description must be 28-45 words; found ${shortWords}.`);
  if (editorialWords < 95 || editorialWords > 140) throw new Error(`${label} editorial description must be 95-140 words; found ${editorialWords}.`);
  if (totalWords < 200) throw new Error(`${label} requires at least 200 publisher words; found ${totalWords}.`);
  if (candidate.seo.title.length < 30 || candidate.seo.title.length > 65) throw new Error(`${label} SEO title must be 30-65 characters.`);
  if (candidate.seo.description.length < 120 || candidate.seo.description.length > 165) throw new Error(`${label} meta description must be 120-165 characters.`);
  const processJargon = /\b(?:crawl(?:ed|ing|er)?|extract(?:ed|ion)?|this record|this listing|this directory|the dataset|source snapshot|ai-generated)\b/i;
  if (processJargon.test(contentText(candidate))) throw new Error(`${label} contains user-facing research-process jargon.`);
}

function hasEvidenceFor(candidate, supports, { officialOnly = false } = {}) {
  const fields = new Set(Array.isArray(supports) ? supports : [supports]);
  return candidate.evidence.some((evidence) => {
    if (officialOnly && !["official_site", "official_menu"].includes(evidence.sourceType)) return false;
    return evidence.supports?.some((field) => fields.has(field));
  });
}

function hasKnownService(candidate) {
  return Object.entries(candidate.services || {}).some(([field, value]) => field !== "confidence" && ["yes", "no"].includes(value));
}

function qualityProfile(candidate, normalizedHours, lateNight, copyQa) {
  const identityConflict = (candidate.reviewFlags || []).some((flag) => /(?:address|postal|identity)_conflict/.test(flag));
  const completeHours = dayNames.every((day) => normalizedHours[day] === "closed" || normalizedHours[day].split("|").every((interval) => parseHoursInterval(interval)));
  const facts = {
    identity: !identityConflict
      && hasEvidenceFor(candidate, "identity", { officialOnly: true })
      && hasEvidenceFor(candidate, "coordinates")
      && placeRegistryByKey.has(candidate.sourceKey),
    relevance: ["primary", "substantial"].includes(candidate.relevance.classification)
      && candidate.relevance.itemCount >= 1
      && hasEvidenceFor(candidate, ["ramen_relevance", "menu"], { officialOnly: true }),
    menu: candidate.menu.items.length > 0 && hasEvidenceFor(candidate, "menu", { officialOnly: true }),
    hours: completeHours && hasEvidenceFor(candidate, "hours", { officialOnly: true }),
    lateNight: lateNight.status !== "unknown" && hasEvidenceFor(candidate, "hours", { officialOnly: true }),
    taxonomy: Boolean(candidate.taxonomy?.brothBases?.length
      || candidate.taxonomy?.brothStyles?.length
      || candidate.taxonomy?.tares?.length
      || candidate.taxonomy?.servingStyles?.length
      || [candidate.taxonomy?.tonkotsu, candidate.taxonomy?.shoyu, candidate.taxonomy?.miso, candidate.taxonomy?.tsukemen].some((value) => ["yes", "no"].includes(value)))
      && hasEvidenceFor(candidate, ["taxonomy", "menu"], { officialOnly: true }),
    prices: Boolean((candidate.prices?.items || candidate.menu.items).some((item) => Number.isFinite(Number(item.price))))
      && hasEvidenceFor(candidate, ["prices", "menu"], { officialOnly: true }),
    vegan: Boolean(candidate.vegan?.status && candidate.vegan.status !== "unknown") && hasEvidenceFor(candidate, "vegan", { officialOnly: true }),
    noodles: Boolean(candidate.noodles?.status && candidate.noodles.status !== "unknown") && hasEvidenceFor(candidate, "noodles", { officialOnly: true }),
    reservations: Boolean(candidate.reservations?.status && candidate.reservations.status !== "unknown") && hasEvidenceFor(candidate, "reservations", { officialOnly: true }),
    services: hasKnownService(candidate) && hasEvidenceFor(candidate, "services", { officialOnly: true }),
  };
  const evidenceStrong = candidate.evidence.length >= 2
    && candidate.evidence.some((evidence) => ["official_site", "official_menu"].includes(evidence.sourceType) && evidenceRegistryByUrl.get(evidence.url)?.success)
    && candidate.evidence.some((evidence) => evidence.sourceType === "licensed_maps_provider" && placeRegistryByKey.has(candidate.sourceKey));
  const verificationCutoff = Date.parse(`${verificationDate}T23:59:59Z`);
  const maximumEvidenceAgeMs = 120 * 24 * 60 * 60 * 1000;
  const fresh = candidate.evidence.every((evidence) => {
    const registeredAt = ["official_site", "official_menu"].includes(evidence.sourceType)
      ? evidenceRegistryByUrl.get(evidence.url)?.retrievedAt
      : evidence.sourceType === "licensed_maps_provider"
        ? placeRegistryByKey.get(candidate.sourceKey)?.retrievedAt
        : evidence.retrievedAt;
    const checkedAt = Date.parse(registeredAt || "");
    return Number.isFinite(checkedAt)
      && checkedAt <= verificationCutoff
      && verificationCutoff - checkedAt <= maximumEvidenceAgeMs;
  });
  const originalContent = copyQa.status === "pass" && words(contentText(candidate)).length >= 200;
  const decisionCount = Object.values(facts).filter(Boolean).length;
  let score = 0;
  if (facts.identity) score += 15;
  if (facts.relevance) score += 15;
  if (facts.menu) score += 15;
  if (facts.hours) score += 10;
  if (facts.taxonomy) score += 10;
  if (evidenceStrong) score += 10;
  if (originalContent) score += 10;
  if (fresh) score += 5;
  if (facts.prices) score += 5;
  if (facts.vegan) score += 1;
  if (facts.noodles) score += 1;
  if (facts.reservations) score += 1;
  if (facts.services) score += 1;
  if (identityConflict) score = Math.min(score, 79);
  return { decisionCount, score: Math.min(score, 100), facts, evidenceStrong, fresh, originalContent };
}

function buildRow(candidate, copyQa) {
  const row = {};
  const identityKey = normalizedCopy(`${candidate.name}|${candidate.branchName}|${candidate.location.street}|${candidate.location.postalCode}`);
  const restaurantId = `ramen_ca_${sha256(identityKey).slice(0, 20)}`;
  const brandId = `brand_${sha256(normalizedCopy(candidate.brandName || candidate.name)).slice(0, 16)}`;
  const slug = candidate.slug || slugify(`${candidate.name}-${candidate.branchName}`);
  const citySlug = slugify(candidate.location.city);
  const canonicalPath = `/restaurants/${candidate.location.provinceCode.toLowerCase()}/${citySlug}/${slug}`;
  const menuItems = candidate.menu.items.slice(0, 3);
  const observedPrices = (candidate.prices?.items || candidate.menu.items).map((item) => Number(item.price)).filter(Number.isFinite).sort((a, b) => a - b);
  const priceMin = observedPrices.at(0);
  const priceMax = observedPrices.at(-1);
  const priceMedian = observedPrices.length ? observedPrices[Math.floor((observedPrices.length - 1) / 2)] : undefined;
  const normalizedHours = normalizeWeeklyHours(candidate.hours);
  const lateNight = deriveLateNight(normalizedHours);
  const profile = qualityProfile(candidate, normalizedHours, lateNight, copyQa);
  const decisionCount = profile.decisionCount;
  const qualityScore = profile.score;
  const content = contentText(candidate);
  const sourcePublishers = [...new Set(candidate.evidence.map((evidence) => evidence.publisher))];
  const officialEvidenceCount = candidate.evidence.filter((evidence) => ["official_site", "official_menu"].includes(evidence.sourceType)).length;
  const faqEntries = (candidate.content.faqs || []).slice(0, 4);
  const identityConflict = (candidate.reviewFlags || []).some((flag) => /(?:address|postal|identity)_conflict/.test(flag));
  const failCodes = [
    "directory_canonical_domain_missing",
    "human_review_required",
    "schema_validation_required",
    "schema_visible_parity_unchecked",
    "adsense_editorial_review_required",
    ...(candidate.reviewFlags || []),
  ];

  Object.assign(row, {
    restaurant_id: restaurantId,
    parent_brand_id: brandId,
    source_google_place_id: candidate.googlePlaceId || "",
    source_row_number: candidate.sourceKey,
    source_dataset_file: "curated-additions.source.json",
    record_status: "active",
    publication_status: "needs_review",
    robots_directive: "noindex,follow",
    ads_allowed: "no",
    gate_status: "needs_human_review",
    gate_fail_codes: failCodes,
    quality_score_0_100: qualityScore,
    author_id: "Ramen Scout Editorial",
    language: "en-CA",
    enriched_at: verificationTimestamp,
    next_review_due: nextReviewDue,
    name: candidate.name,
    alternate_names: candidate.alternateNames || [],
    brand_name: candidate.brandName || candidate.name,
    branch_name: candidate.branchName,
    slug,
    canonical_path: canonicalPath,
    business_status: "operational",
    business_status_verified_at: verificationDate,
    phone_e164: candidate.contact.phone,
    official_website_url: candidate.contact.website || candidate.contact.locationUrl,
    official_location_url: candidate.contact.locationUrl,
    official_menu_url: candidate.contact.menuUrl,
    official_reservation_url: candidate.contact.reservationUrl,
    official_order_url: candidate.contact.orderUrl,
    google_maps_url: candidate.contact.mapsUrl,
    same_as_urls: [candidate.contact.website, candidate.contact.locationUrl, candidate.contact.mapsUrl].filter(Boolean),
    street_address: candidate.location.street,
    unit: candidate.location.unit,
    neighbourhood: candidate.location.neighbourhood,
    city: candidate.location.city,
    county_or_region: candidate.location.region,
    province_name: candidate.location.provinceName,
    province_code: candidate.location.provinceCode,
    postal_code: candidate.location.postalCode,
    postal_fsa: candidate.location.postalCode.replace(/\s+/g, "").slice(0, 3),
    country_name: "Canada",
    country_code: "CA",
    latitude: candidate.location.latitude,
    longitude: candidate.location.longitude,
    geocode_precision: candidate.location.geocodePrecision || "business_pin",
    timezone: candidate.location.timezone,
    nearest_transit: candidate.location.nearestTransit,
    parking_summary: candidate.location.parking || [],
    identity_evidence_refs: evidenceRefs(candidate, "identity", "coordinates"),
    identity_verified_at: verificationDate,
    identity_confidence: identityConflict ? "medium" : "high",
    ramen_relevance: candidate.relevance.classification,
    permanent_ramen_item_count: candidate.relevance.itemCount,
    ramen_menu_share_pct: candidate.relevance.menuSharePct,
    ramen_relevance_reason: candidate.relevance.reason,
    relevance_evidence_refs: evidenceRefs(candidate, "ramen_relevance", "menu"),
    relevance_verified_at: verificationDate,
    relevance_confidence: candidate.relevance.confidence || "high",
    hours_mon: normalizedHours.Monday,
    hours_tue: normalizedHours.Tuesday,
    hours_wed: normalizedHours.Wednesday,
    hours_thu: normalizedHours.Thursday,
    hours_fri: normalizedHours.Friday,
    hours_sat: normalizedHours.Saturday,
    hours_sun: normalizedHours.Sunday,
    hours_notes: candidate.hours.notes,
    special_hours_url: candidate.hours.specialHoursUrl,
    hours_evidence_refs: evidenceRefs(candidate, "hours"),
    hours_verified_at: verificationDate,
    hours_confidence: candidate.hours.confidence || "high",
    late_night_status: lateNight.status,
    late_night_days: lateNight.days,
    late_night_latest_close: lateNight.latestClose,
    late_night_cutoff_local: "23:00",
    late_night_evidence_refs: evidenceRefs(candidate, "hours"),
    late_night_verified_at: verificationDate,
    late_night_confidence: candidate.hours.confidence || "high",
    menu_status: "verified_current",
    menu_url: candidate.contact.menuUrl,
    menu_source_type: candidate.menu.sourceType || "official_menu",
    menu_effective_date: candidate.menu.effectiveDate,
    menu_verified_at: verificationDate,
    menu_content_hash: sha256(candidate.evidence
      .filter((evidence) => evidence.supports.includes("menu") && ["official_site", "official_menu"].includes(evidence.sourceType))
      .map((evidence) => evidenceRegistryByUrl.get(evidence.url)?.contentHash)
      .filter(Boolean)
      .sort()
      .join("\n")),
    menu_evidence_refs: evidenceRefs(candidate, "menu"),
    menu_confidence: candidate.menu.confidence || "high",
    broth_base_values: candidate.taxonomy.brothBases || [],
    broth_style_values: candidate.taxonomy.brothStyles || [],
    tare_values: candidate.taxonomy.tares || [],
    serving_style_values: candidate.taxonomy.servingStyles || ["ramen"],
    has_tonkotsu: candidate.taxonomy.tonkotsu,
    has_shoyu: candidate.taxonomy.shoyu,
    has_miso: candidate.taxonomy.miso,
    has_tsukemen: candidate.taxonomy.tsukemen,
    taxonomy_evidence_refs: evidenceRefs(candidate, "taxonomy", "menu"),
    taxonomy_verified_at: verificationDate,
    taxonomy_confidence: candidate.taxonomy.confidence || "high",
    vegan_status: candidate.vegan?.status || "unknown",
    vegan_complete_bowl_count: candidate.vegan?.bowlCount,
    vegan_customization_required: candidate.vegan?.customizationRequired || "unknown",
    vegan_item_names: candidate.vegan?.itemNames || [],
    vegan_cross_contact_note: candidate.vegan?.note,
    vegan_evidence_refs: candidate.vegan?.status && candidate.vegan.status !== "unknown" ? evidenceRefs(candidate, "vegan", "menu") : [],
    vegan_verified_at: candidate.vegan?.status && candidate.vegan.status !== "unknown" ? verificationDate : "",
    vegan_confidence: candidate.vegan?.confidence || "unknown",
    halal_status: candidate.halal?.status || "unknown",
    verified_halal_options: candidate.halal?.verifiedOptions || "unknown",
    halal_scope: candidate.halal?.scope,
    halal_certifier_name: candidate.halal?.certifier,
    halal_certificate_url: candidate.halal?.certificateUrl,
    halal_source_type: candidate.halal?.sourceType || "none",
    halal_evidence_refs: candidate.halal?.status && candidate.halal.status !== "unknown" ? evidenceRefs(candidate, "halal") : [],
    halal_verified_at: candidate.halal?.status && candidate.halal.status !== "unknown" ? verificationDate : "",
    halal_confidence: candidate.halal?.confidence || "unknown",
    halal_notes: candidate.halal?.note,
    house_made_noodles_status: candidate.noodles?.status || "unknown",
    house_made_noodles_verified: candidate.noodles?.verified || "unknown",
    house_made_noodles_scope: candidate.noodles?.scope,
    noodle_making_location: candidate.noodles?.makingLocation,
    noodle_supplier: candidate.noodles?.supplier,
    noodle_style_values: candidate.noodles?.styles || [],
    noodles_evidence_refs: candidate.noodles?.status && candidate.noodles.status !== "unknown" ? evidenceRefs(candidate, "noodles") : [],
    noodles_verified_at: candidate.noodles?.status && candidate.noodles.status !== "unknown" ? verificationDate : "",
    noodles_confidence: candidate.noodles?.confidence || "unknown",
    currency: "CAD",
    ramen_price_observed_item_count: observedPrices.length,
    ramen_price_min_cad: priceMin,
    ramen_price_max_cad: priceMax,
    ramen_price_median_cad: priceMedian,
    typical_bowl_price_cad: priceMedian,
    price_band: priceBand(priceMedian),
    price_band_rules_version: observedPrices.length ? "ca_ramen_2026_v1" : "",
    price_evidence_refs: observedPrices.length ? evidenceRefs(candidate, "prices", "menu") : [],
    price_verified_at: observedPrices.length ? verificationDate : "",
    price_confidence: observedPrices.length ? candidate.prices?.confidence || "high" : "unknown",
    reservations_status: candidate.reservations?.status || "unknown",
    reservation_channels: candidate.reservations?.channels || [],
    reservation_url: candidate.contact.reservationUrl,
    reservation_party_size_notes: candidate.reservations?.partySizeNote,
    reservation_notes: candidate.reservations?.note,
    reservations_evidence_refs: candidate.reservations?.status && candidate.reservations.status !== "unknown" ? evidenceRefs(candidate, "reservations") : [],
    reservations_verified_at: candidate.reservations?.status && candidate.reservations.status !== "unknown" ? verificationDate : "",
    reservations_confidence: candidate.reservations?.confidence || "unknown",
    dine_in_status: candidate.services?.dineIn || "unknown",
    takeout_status: candidate.services?.takeout || "unknown",
    delivery_status: candidate.services?.delivery || "unknown",
    outdoor_seating_status: candidate.services?.outdoorSeating || "unknown",
    wheelchair_entrance_status: candidate.services?.wheelchairEntrance || "unknown",
    wheelchair_seating_status: candidate.services?.wheelchairSeating || "unknown",
    wheelchair_washroom_status: candidate.services?.wheelchairWashroom || "unknown",
    family_friendly_status: candidate.services?.familyFriendly || "unknown",
    alcohol_status: candidate.services?.alcohol || "unknown",
    service_evidence_refs: candidate.services && Object.values(candidate.services).some((value) => ["yes", "no"].includes(value)) ? evidenceRefs(candidate, "services") : [],
    service_verified_at: candidate.services && Object.values(candidate.services).some((value) => ["yes", "no"].includes(value)) ? verificationDate : "",
    service_confidence: candidate.services?.confidence || "unknown",
    short_description: candidate.content.shortDescription,
    editorial_description: candidate.content.editorialDescription,
    why_go: candidate.content.whyGo,
    what_to_order: candidate.content.whatToOrder,
    best_for: candidate.content.bestFor,
    visit_tips: candidate.content.visitTips,
    neighbourhood_context: candidate.content.neighbourhoodContext,
    limitations_caveats: candidate.content.caveats,
    source_summary: `${candidate.evidence.length} evidence records from ${sourcePublishers.join(", ")}, including ${officialEvidenceCount} official or restaurant-linked source${officialEvidenceCount === 1 ? "" : "s"}; human editorial review remains required.`,
    content_method: "Evidence-led editorial synthesis from cited official or restaurant-linked sources; no source prose reproduced; human review required before publication.",
    automation_disclosure: "AI-assisted research and drafting; facts are source-linked and publication remains blocked pending human review.",
    publisher_content_word_count: words(content).length,
    description_specific_fact_count: candidate.content.specificFactCount,
    supported_claim_pct: "",
    seo_title: candidate.seo.title,
    meta_description: candidate.seo.description,
    h1: candidate.seo.h1 || `${candidate.name} ${candidate.branchName}: ${candidate.location.city} ramen`,
    sitewide_primary_keyword: "ramen near me",
    listing_primary_keyword: `ramen near ${candidate.location.city}`,
    primary_search_intent: `Find current ramen menu, hours and visit details for ${candidate.name} ${candidate.branchName} in ${candidate.location.city}.`,
    secondary_topics: candidate.seo.secondaryTopics || [],
    supported_keyword_topics: candidate.seo.topics,
    breadcrumb_label: candidate.seo.breadcrumbLabel || `${candidate.name} ${candidate.branchName}`,
    og_title: candidate.seo.title,
    og_description: candidate.seo.description,
    hero_image_rights_status: "not_provided",
    faq_count: faqEntries.length,
    rating_schema_eligible: "no",
    external_rating_display_rights: "not_collected",
    external_rating_in_schema: "no",
    schema_types: "Restaurant",
    schema_validation_status: "not_run",
    schema_visible_parity_status: "not_run",
    schema_warnings: "schema_validation_required|directory_canonical_url_missing|breadcrumb_markup_requires_site_base_url|rich_results_test_required_after_implementation",
    gate_identity_pass: profile.facts.identity ? "yes" : "no",
    gate_relevance_pass: profile.facts.relevance ? "yes" : "no",
    gate_freshness_pass: profile.fresh ? "yes" : "no",
    gate_decision_data_pass: decisionCount >= 6 ? "yes" : "no",
    gate_evidence_pass: profile.evidenceStrong ? "yes" : "no",
    gate_originality_pass: copyQa.status === "pass" ? "yes" : "no",
    gate_schema_pass: "no",
    gate_visible_schema_parity_pass: "no",
    gate_rights_pass: "yes",
    gate_human_review_pass: "no",
    gate_adsense_content_pass: "no",
    verified_decision_field_count: decisionCount,
    copy_normalized_hash: sha256(normalizedCopy(content)),
    copy_most_similar_restaurant_id: copyQa.mostSimilarId,
    copy_word_5gram_jaccard_max: copyQa.maxJaccard.toFixed(4),
    copy_reused_sentence_count: copyQa.reusedSentenceCount,
    copy_boilerplate_token_pct: "",
    copy_source_longest_match_tokens: copyQa.sourceLongestMatch,
    copy_qa_status: copyQa.status,
    copy_qa_notes: "Compared with the complete base and curated corpus: no identical whole sentence of at least eight words, no eight-token factual-snapshot match, and five-gram Jaccard below 0.15. Boilerplate percentage and semantic similarity were not asserted.",
    staging_media_publishable: "no",
    staging_source_description_publishable: "no",
  });

  menuItems.forEach((item, index) => {
    const slot = index + 1;
    Object.assign(row, {
      [`signature_${slot}_name`]: item.name,
      [`signature_${slot}_price_cad`]: item.price,
      [`signature_${slot}_broth_base`]: item.brothBase || [],
      [`signature_${slot}_broth_style`]: item.brothStyle || [],
      [`signature_${slot}_tare`]: item.tare || [],
      [`signature_${slot}_serving_style`]: item.servingStyle || ["ramen"],
      [`signature_${slot}_dietary_tags`]: item.dietary || [],
      [`signature_${slot}_evidence_refs`]: item.evidenceRefs,
    });
  });

  faqEntries.forEach((faq, index) => {
    const slot = index + 1;
    Object.assign(row, {
      [`faq_${slot}_question`]: faq.question,
      [`faq_${slot}_answer`]: faq.answer,
      [`faq_${slot}_evidence_refs`]: faq.evidenceRefs,
      [`faq_${slot}_verified_at`]: verificationDate,
    });
  });

  candidate.evidence.slice(0, 12).forEach((evidence, index) => {
    const slot = index + 1;
    const isFirstParty = ["official_site", "official_menu"].includes(evidence.sourceType);
    const fetchedEvidence = isFirstParty ? evidenceRegistryByUrl.get(evidence.url) : null;
    const checkedPlace = evidence.sourceType === "licensed_maps_provider" ? placeRegistryByKey.get(candidate.sourceKey) : null;
    const checkedPlaceHash = checkedPlace ? sha256(JSON.stringify({
      candidateKey: checkedPlace.candidateKey,
      googlePlaceId: checkedPlace.googlePlaceId,
      mapsName: checkedPlace.mapsName,
      mapsAddress: checkedPlace.mapsAddress,
      latitude: checkedPlace.latitude,
      longitude: checkedPlace.longitude,
      mapsUrl: checkedPlace.mapsUrl,
      retrievedAt: checkedPlace.retrievedAt,
    })) : "";
    Object.assign(row, {
      [`evidence_${slot}_url`]: evidence.url,
      [`evidence_${slot}_source_type`]: evidence.sourceType,
      [`evidence_${slot}_publisher`]: evidence.publisher,
      [`evidence_${slot}_retrieved_at`]: fetchedEvidence?.retrievedAt || checkedPlace?.retrievedAt || evidence.retrievedAt,
      [`evidence_${slot}_effective_date`]: evidence.effectiveDate || verificationDate,
      [`evidence_${slot}_supports_fields`]: evidence.supports,
      [`evidence_${slot}_content_hash`]: fetchedEvidence?.contentHash || checkedPlaceHash,
      [`evidence_${slot}_notes`]: isFirstParty
        ? `Crawl4AI-assisted official or restaurant-linked source research; content hash covers normalized fetched ${fetchedEvidence.extractionMethod.includes("pdf") ? "PDF bytes" : fetchedEvidence.extractionMethod.includes("fallback") ? "response bytes after an empty Crawl4AI result" : "page content"}.`
        : "Independently matched Google Maps identity record; content hash covers the checked structured identity and coordinate record, not restaurant editorial copy.",
    });
  });

  return row;
}

const masterTable = parseCsv(await fs.readFile(masterPath, "utf8"));
const headers = masterTable[0];
if (headers.length !== 378 || new Set(headers).size !== headers.length) throw new Error("Master enrichment header is not the expected unique 378-column schema.");
const baseRows = masterTable.slice(1).filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
if (source.policyVersion !== "curated-additions-v1") throw new Error("Unknown curated additions policy version.");
if (!Array.isArray(source.restaurants)) throw new Error("curated-additions.source.json must contain a restaurants array.");
const evidenceRegistry = JSON.parse(await fs.readFile(evidenceRegistryPath, "utf8"));
if (evidenceRegistry.schemaVersion !== "1.0" || !Array.isArray(evidenceRegistry.records)) throw new Error("Curated evidence registry has an unsupported schema.");
evidenceRegistryByUrl = new Map(evidenceRegistry.records.map((record) => [record.url, record]));
if (evidenceRegistryByUrl.size !== evidenceRegistry.records.length) throw new Error("Curated evidence registry contains duplicate URLs.");
const placeRegistry = JSON.parse(await fs.readFile(placeRegistryPath, "utf8"));
if (placeRegistry.schemaVersion !== "1.0" || !Array.isArray(placeRegistry.records)) throw new Error("Curated place registry has an unsupported schema.");
placeRegistryByKey = new Map(placeRegistry.records.map((record) => [record.candidateKey, record]));
if (placeRegistryByKey.size !== placeRegistry.records.length) throw new Error("Curated place registry contains duplicate candidate keys.");
for (const candidate of source.restaurants) {
  const checkedPlace = placeRegistryByKey.get(candidate.sourceKey);
  if (!checkedPlace || checkedPlace.googlePlaceId !== candidate.googlePlaceId || checkedPlace.mapsUrl !== candidate.contact.mapsUrl) {
    throw new Error(`${candidate.name} (${candidate.branchName}) does not match the independently checked place registry.`);
  }
  for (const evidence of candidate.evidence.filter((entry) => ["official_site", "official_menu"].includes(entry.sourceType))) {
    const fetched = evidenceRegistryByUrl.get(evidence.url);
    if (!fetched?.success || !/^[a-f0-9]{64}$/.test(fetched.contentHash || "") || !fetched.retrievedAt || !fetched.extractionMethod) {
      throw new Error(`${candidate.name} (${candidate.branchName}) lacks a successful fetched-content record for ${evidence.url}.`);
    }
  }
}
source.restaurants.forEach(validateCandidate);

const allCopy = baseRows.map((row) => ({
  id: row.restaurant_id,
  text: [row.short_description, row.editorial_description, row.why_go, row.what_to_order, row.best_for, row.visit_tips, row.neighbourhood_context, row.limitations_caveats, ...[1, 2, 3, 4].flatMap((slot) => [row[`faq_${slot}_question`], row[`faq_${slot}_answer`]])].filter(Boolean).join(" "),
}));
const candidateCopy = source.restaurants.map((candidate) => ({ candidate, id: `ramen_ca_${sha256(normalizedCopy(`${candidate.name}|${candidate.branchName}|${candidate.location.street}|${candidate.location.postalCode}`)).slice(0, 20)}`, text: contentText(candidate) }));
allCopy.push(...candidateCopy.map(({ id, text }) => ({ id, text })));
const sentenceOwners = new Map();
for (const entry of allCopy) {
  for (const sentence of new Set(sentences(entry.text))) {
    if (!sentenceOwners.has(sentence)) sentenceOwners.set(sentence, []);
    sentenceOwners.get(sentence).push(entry.id);
  }
}

const rows = candidateCopy.map(({ candidate, id, text }) => {
  const leftNgrams = ngrams(text);
  let maxJaccard = 0;
  let mostSimilarId = "";
  for (const other of allCopy) {
    if (other.id === id) continue;
    const score = jaccard(leftNgrams, ngrams(other.text));
    if (score > maxJaccard) { maxJaccard = score; mostSimilarId = other.id; }
  }
  const reusedSentences = sentences(text).filter((sentence) => (sentenceOwners.get(sentence) || []).some((owner) => owner !== id));
  const reusedSentenceCount = reusedSentences.length;
  const sourceLongestMatch = Math.max(0, ...candidate.evidence.map((evidence) => longestCommonTokenRun(text, evidence.factsSnapshot)));
  const status = maxJaccard < 0.15 && reusedSentenceCount === 0 && sourceLongestMatch < 8 ? "pass" : "fail";
  if (status !== "pass") {
    const details = reusedSentences.map((sentence) => `${sentence} [${(sentenceOwners.get(sentence) || []).filter((owner) => owner !== id).join(", ")}]`).join(" | ");
    throw new Error(`${candidate.name} ${candidate.branchName} failed copy QA: Jaccard ${maxJaccard.toFixed(4)}, reused sentences ${reusedSentenceCount}, source match ${sourceLongestMatch}${details ? `: ${details}` : ""}.`);
  }
  const row = buildRow(candidate, { maxJaccard, mostSimilarId, reusedSentenceCount, sourceLongestMatch, status });
  if (Number(row.quality_score_0_100) < 90 || Number(row.verified_decision_field_count) < 6) {
    throw new Error(`${candidate.name} ${candidate.branchName} does not meet the publishable 90-point quality and six-decision-group admission floor.`);
  }
  return row;
});

const ids = rows.map((row) => row.restaurant_id);
const paths = rows.map((row) => row.canonical_path);
const normalizedIdentities = rows.map((row) => slugify(`${row.name}-${row.street_address}-${row.postal_code}`));
for (const [values, label] of [[ids, "restaurant IDs"], [paths, "canonical paths"], [normalizedIdentities, "normalized identities"]]) {
  if (new Set(values).size !== values.length) throw new Error(`Curated additions contain duplicate ${label}.`);
}

const csv = [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n";
await fs.writeFile(outputPath, csv, "utf8");
console.log(JSON.stringify({ policyVersion: source.policyVersion, additions: rows.length, columns: headers.length, outputPath }, null, 2));
