import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveSearchReadinessProfile } from "../lib/search-readiness-profile.js";
import { applySearchReadinessEnrichment, validateSearchReadinessEnrichments } from "../lib/search-readiness-enrichments.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const inputPath = path.join(root, "data", "restaurants.json");
const outputPath = path.join(root, "data", "search-readiness-supplements.json");
const enrichmentsPath = path.join(root, "data", "search-readiness-menu-enrichments.json");
// Targeted refreshes preserve unrelated captures and fail closed on a rejected menu.
const selectedIds = new Set((process.env.RESTAURANT_IDS || "").split(",").filter(Boolean));
const crawl4aiUrl = (process.env.CRAWL4AI_URL || "http://192.168.1.201:11235").replace(/\/+$/, "");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normalizeText = (value) => String(value || "").normalize("NFKC").replace(/\r\n?/g, "\n").trim();

function host(value) {
  return new URL(value).hostname.toLowerCase();
}

function distinctHostBatches(urls, size = 8) {
  const pending = [...urls];
  const batches = [];
  while (pending.length) {
    const batch = [];
    const hosts = new Set();
    for (let index = 0; index < pending.length && batch.length < size;) {
      const candidateHost = host(pending[index]);
      if (hosts.has(candidateHost)) { index += 1; continue; }
      hosts.add(candidateHost);
      batch.push(pending.splice(index, 1)[0]);
    }
    if (!batch.length) batch.push(pending.shift());
    batches.push(batch);
  }
  return batches;
}

async function crawlBatch(urls, delayBeforeReturnHtml = 1) {
  const response = await fetch(`${crawl4aiUrl}/crawl/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify({
      urls,
      browser_config: { type: "BrowserConfig", params: { text_mode: true, light_mode: true, viewport_width: 1280, viewport_height: 900 } },
      crawler_config: { type: "CrawlerRunConfig", params: {
        cache_mode: { type: "CacheMode", params: "bypass" },
        page_timeout: 45_000,
        wait_until: "domcontentloaded",
        delay_before_return_html: delayBeforeReturnHtml,
        scan_full_page: true,
        remove_overlay_elements: true,
        process_iframes: true,
        check_robots_txt: true,
      } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) throw new Error(`Crawl4AI returned HTTP ${response.status}`);
  const parsed = [];
  let buffer = "";
  const consume = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event?.status !== "completed") parsed.push(event.result || event);
  };
  for await (const chunk of response.body) {
    buffer += Buffer.from(chunk).toString("utf8");
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      consume(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  if (buffer.trim()) consume(buffer);
  const remaining = [...urls];
  return parsed.map((result) => {
    const index = remaining.findIndex((url) => result?.url && host(url) === host(result.url));
    const requestedUrl = index >= 0 ? remaining.splice(index, 1)[0] : remaining.shift();
    return requestedUrl ? [requestedUrl, result] : null;
  }).filter(Boolean);
}

function menuSignals(markdown, restaurants) {
  const plain = normalizeText(markdown).toLocaleLowerCase("en-CA");
  const ramenTerms = plain.match(/\b(?:ramen|mazesoba|tsukemen|noodle)\b/g)?.length || 0;
  const priceSignals = plain.match(/(?:\$|cad\s*)\s*\d{1,3}(?:\.\d{2})?/gi)?.length || 0;
  let matchedItems = 0;
  for (const restaurant of restaurants) {
    for (const item of restaurant.menu.items) {
      const tokens = item.name.toLocaleLowerCase("en-CA").match(/[\p{L}\p{N}]+/gu) || [];
      const distinctive = tokens.filter((token) => token.length >= 4 && !["ramen", "spicy", "original", "classic"].includes(token));
      if (distinctive.length && distinctive.slice(0, 2).every((token) => plain.includes(token))) matchedItems += 1;
    }
  }
  return { ramenTerms, priceSignals, matchedItems, qualifies: ramenTerms >= 2 && (matchedItems >= 1 || priceSignals >= 2 || /\bmenu\b/.test(plain)) };
}

function pendingSupplementReferences(enrichment) {
  return [
    ...enrichment.items.flatMap((item) => item.evidenceRefs || []),
    ...(enrichment.prices?.evidenceRefs || []),
    ...(enrichment.vegan?.evidenceRefs || []),
    ...(enrichment.taxonomy?.evidenceRefs || []),
    ...(enrichment.noodles?.evidenceRefs || []),
  ].includes("SR1");
}

function withPendingSupplementEvidence(restaurant, enrichment) {
  if (!enrichment || !pendingSupplementReferences(enrichment) || restaurant.evidence.some((evidence) => evidence.id === "SR1")) return restaurant;
  return {
    ...restaurant,
    evidence: [...restaurant.evidence, {
      id: "SR1",
      url: restaurant.menu.url,
      sourceType: "official_menu",
      publisher: new URL(restaurant.menu.url).hostname,
      retrievedAt: new Date(0).toISOString(),
      contentHash: "0".repeat(64),
    }],
  };
}

function normalizedDocumentUrl(value) {
  const parsed = new URL(value);
  parsed.hash = "";
  return decodeURIComponent(parsed.toString()).replace(/\/+$/, "");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordpressDerivativePattern(url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const match = pathname.match(/^(.*?)(\.[a-z0-9]+)$/i);
  if (!match) return null;
  return new RegExp(`${escapeRegex(match[1])}-\\d+x\\d+${escapeRegex(match[2])}(?:[?"'\\s<>)\\]]|$)`, "i");
}

async function fetchLinkedDocuments(enrichment, markdown) {
  if (!enrichment?.linkedDocuments?.length) return [];
  let normalizedMarkdown = markdown.replace(/\\/g, "");
  try { normalizedMarkdown = decodeURIComponent(normalizedMarkdown); } catch { /* Preserve malformed percent text verbatim. */ }
  const documents = [];
  for (const url of enrichment.linkedDocuments) {
    const normalizedUrl = normalizedDocumentUrl(url);
    const urlPath = decodeURIComponent(new URL(url).pathname);
    const derivativePattern = wordpressDerivativePattern(url);
    if (!normalizedMarkdown.includes(normalizedUrl) && !normalizedMarkdown.includes(urlPath) && !derivativePattern?.test(normalizedMarkdown)) {
      throw new Error(`Linked menu document is no longer present on ${enrichment.menuUrl}: ${url}`);
    }
    const response = await fetch(url, { headers: { "user-agent": "Ramen Scout evidence verifier/1.0" }, signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`Linked menu document returned HTTP ${response.status}: ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (bytes.length < 1_000 || !/^(?:image\/|application\/pdf$)/.test(contentType)) {
      throw new Error(`Linked menu document is not a substantial image or PDF: ${url}`);
    }
    documents.push({ url, finalUrl: response.url || url, contentType, bytes: bytes.length, contentHash: sha256(bytes) });
  }
  return documents;
}

const health = await fetch(`${crawl4aiUrl}/health`, { signal: AbortSignal.timeout(10_000) });
if (!health.ok) throw new Error(`Crawl4AI health check returned ${health.status}`);

const restaurants = JSON.parse(await fs.readFile(inputPath, "utf8"));
const enrichmentById = validateSearchReadinessEnrichments(JSON.parse(await fs.readFile(enrichmentsPath, "utf8")));
const enrichedRestaurants = restaurants.map((restaurant) => {
  const enrichment = enrichmentById.get(restaurant.id);
  const enriched = applySearchReadinessEnrichment(restaurant, enrichment, { allowPendingSupplementEvidence: true });
  return withPendingSupplementEvidence(enriched, enrichment);
});
for (const restaurantId of enrichmentById.keys()) if (!restaurants.some((restaurant) => restaurant.id === restaurantId)) throw new Error(`Menu enrichment references unknown restaurant ID ${restaurantId}.`);
const candidates = enrichedRestaurants.map((restaurant) => ({ restaurant, profile: deriveSearchReadinessProfile(restaurant) })).filter(({ restaurant, profile }) => (
  restaurant.publication.gates.identity === "yes"
  && restaurant.publication.gates.relevance === "yes"
  && (restaurant.publication.gates.evidence === "yes" || selectedIds.has(restaurant.id) && profile.evidenceStrong)
  && restaurant.publication.gates.originality === "yes"
  && restaurant.publication.gates.rights === "yes"
  && ["primary", "substantial"].includes(restaurant.relevance.classification)
  && restaurant.menu.status === "verified_current"
  && restaurant.menu.itemCount > 0
  && /^https?:\/\//.test(restaurant.menu.url || "")
  && profile.qualityScore >= 90
  && profile.decisionFieldCount >= 6
  && (selectedIds.size ? selectedIds.has(restaurant.id) : restaurant.publication.qualityScore < 90 || restaurant.publication.verifiedDecisionFieldCount < 6)
));
if (selectedIds.size && candidates.length !== selectedIds.size) throw new Error("A selected restaurant did not pass the existing evidence/quality gates.");

const restaurantsByUrl = new Map();
for (const candidate of candidates) {
  const existing = restaurantsByUrl.get(candidate.restaurant.menu.url) || [];
  existing.push(candidate);
  restaurantsByUrl.set(candidate.restaurant.menu.url, existing);
}

const crawlResults = new Map();
const batches = distinctHostBatches([...restaurantsByUrl.keys()].sort());
for (const [index, batch] of batches.entries()) {
  let entries = [];
  try {
    entries = await crawlBatch(batch);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ event: "supplement_batch_retry", batch: index + 1, error: String(error?.message || error) })}\n`);
    for (const url of batch) {
      try { entries.push(...await crawlBatch([url])); }
      catch (individualError) { entries.push([url, { url, success: false, status_code: null, error_message: String(individualError?.message || individualError) }]); }
    }
  }
  for (const [url, result] of entries) crawlResults.set(url, result);
  process.stdout.write(`${JSON.stringify({ event: "supplement_batch", batch: index + 1, batches: batches.length, urls: batch.length, results: entries.length })}\n`);
}

for (const [url, candidateEntries] of restaurantsByUrl) {
  const initial = crawlResults.get(url) || {};
  const initialMarkdown = normalizeText(initial?.markdown?.raw_markdown || initial?.markdown?.fit_markdown || (typeof initial?.markdown === "string" ? initial.markdown : ""));
  const initialSignals = menuSignals(initialMarkdown, candidateEntries.map(({ restaurant }) => restaurant));
  const initialStatus = initial?.status_code ?? null;
  if (Boolean(initial?.success) && initialStatus !== null && initialStatus < 400 && initialMarkdown.length >= 200 && initialSignals.qualifies) continue;
  for (const delay of [3, 5]) {
    try {
      const retried = (await crawlBatch([url], delay))[0]?.[1];
      if (!retried) continue;
      const markdown = normalizeText(retried?.markdown?.raw_markdown || retried?.markdown?.fit_markdown || (typeof retried?.markdown === "string" ? retried.markdown : ""));
      const signals = menuSignals(markdown, candidateEntries.map(({ restaurant }) => restaurant));
      if (markdown.length > initialMarkdown.length || signals.qualifies) crawlResults.set(url, retried);
      process.stdout.write(`${JSON.stringify({ event: "supplement_semantic_retry", url, delay, statusCode: retried?.status_code ?? null, markdownChars: markdown.length, qualifies: signals.qualifies })}\n`);
      if (signals.qualifies) break;
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ event: "supplement_semantic_retry_error", url, delay, error: String(error?.message || error) })}\n`);
    }
  }
}

const retrievedAt = new Date().toISOString();
const records = [];
const rejected = [];
for (const [url, candidateEntries] of restaurantsByUrl) {
  const result = crawlResults.get(url) || {};
  const markdown = normalizeText(result?.markdown?.raw_markdown || result?.markdown?.fit_markdown || (typeof result?.markdown === "string" ? result.markdown : ""));
  const statusCode = result?.status_code ?? null;
  const crawlSuccess = Boolean(result?.success) && statusCode !== null && statusCode < 400 && markdown.length >= 200;
  const signals = menuSignals(markdown, candidateEntries.map(({ restaurant }) => restaurant));
  const enrichments = candidateEntries.map(({ restaurant }) => enrichmentById.get(restaurant.id)).filter(Boolean);
  const linkedDocumentUrls = [...new Set(enrichments.flatMap((enrichment) => enrichment.linkedDocuments || []))];
  let linkedDocuments = [];
  let linkedDocumentError = "";
  if (crawlSuccess && linkedDocumentUrls.length) {
    try {
      linkedDocuments = await fetchLinkedDocuments({ menuUrl: url, linkedDocuments: linkedDocumentUrls }, markdown);
    } catch (error) {
      linkedDocumentError = String(error?.message || error);
    }
  }
  const documentBacked = linkedDocumentUrls.length > 0 && linkedDocuments.length === linkedDocumentUrls.length && !linkedDocumentError;
  if (!crawlSuccess || !(signals.qualifies || documentBacked && signals.ramenTerms >= 1)) {
    rejected.push({ url, restaurantIds: candidateEntries.map(({ restaurant }) => restaurant.id), statusCode, markdownChars: markdown.length, signals, error: result?.error_message || "Menu corroboration gate failed" });
    continue;
  }
  for (const { restaurant, profile } of candidateEntries) {
    const enrichment = enrichmentById.get(restaurant.id);
    const recordDocuments = (enrichment?.linkedDocuments || []).map((documentUrl) => linkedDocuments.find((document) => document.url === documentUrl)).filter(Boolean);
    if ((enrichment?.linkedDocuments || []).length !== recordDocuments.length) {
      rejected.push({ url, restaurantIds: [restaurant.id], statusCode, markdownChars: markdown.length, signals, error: linkedDocumentError || "A linked menu document was not verified" });
      continue;
    }
    const extractionMethod = recordDocuments.length ? "crawl4ai_page_plus_verified_document" : "crawl4ai_normalized_markdown";
    const pageContentHash = sha256(markdown);
    const contentHash = recordDocuments.length ? sha256(JSON.stringify({ pageContentHash, linkedDocuments: recordDocuments })) : pageContentHash;
    records.push({
      restaurantId: restaurant.id,
      url,
      finalUrl: result?.redirected_url || result?.url || url,
      retrievedAt,
      statusCode,
      crawl4aiSuccess: true,
      extractionMethod,
      contentHash,
      pageContentHash,
      markdownChars: markdown.length,
      linkedDocuments: recordDocuments,
      corroboration: { ramenTerms: signals.ramenTerms, priceSignals: signals.priceSignals, matchedItems: signals.matchedItems },
      derivedQualityScore: profile.qualityScore,
      derivedDecisionFieldCount: profile.decisionFieldCount,
      verifiedDecisionGroups: Object.entries(profile.facts).filter(([, value]) => value).map(([field]) => field),
    });
  }
}

if (selectedIds.size) {
  if (records.length !== selectedIds.size || rejected.length) throw new Error("Selected menu refresh failed; existing supplements were not changed.");
  const previous = JSON.parse(await fs.readFile(outputPath, "utf8"));
  records.push(...previous.records.filter((record) => !selectedIds.has(record.restaurantId)));
  rejected.push(...(previous.rejected || []).filter((record) => !(record.restaurantIds || []).some((id) => selectedIds.has(id))));
}
records.sort((left, right) => left.restaurantId.localeCompare(right.restaurantId));
const output = {
  schemaVersion: "1.0",
  generatedAt: retrievedAt,
  crawler: "Crawl4AI",
  policy: "Fresh Crawl4AI menu corroboration, optionally paired with hashed first-party-linked menu images or PDFs that received an item-level editorial review, for existing source-backed listings whose runtime facts independently recompute to at least 90 quality points and six verified decision groups.",
  records,
  rejected,
};
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ candidates: candidates.length, uniqueUrls: restaurantsByUrl.size, accepted: records.length, rejectedUrls: rejected.length, outputPath }, null, 2));
