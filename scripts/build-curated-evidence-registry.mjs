import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const sourcePath = path.join(siteRoot, "data/curated-additions.source.json");
const outputPath = path.join(siteRoot, "data/curated-evidence-registry.json");
const crawlCachePath = path.resolve(siteRoot, "../.codex_tmp/curated_evidence_crawl_cache.json");
const crawl4aiUrl = (process.env.CRAWL4AI_URL || "http://192.168.1.201:11235").replace(/\/+$/, "");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normalizedPageText = (value) => String(value || "").normalize("NFKC").replace(/\r\n?/g, "\n").trim();
const hostname = (value) => new URL(value).hostname.toLowerCase();

function batchesWithDistinctHosts(urls, size = 8) {
  const pending = [...urls];
  const batches = [];
  while (pending.length) {
    const batch = [];
    const hosts = new Set();
    for (let index = 0; index < pending.length && batch.length < size;) {
      const host = hostname(pending[index]);
      if (hosts.has(host)) { index += 1; continue; }
      hosts.add(host);
      batch.push(pending.splice(index, 1)[0]);
    }
    if (!batch.length) batch.push(pending.shift());
    batches.push(batch);
  }
  return batches;
}

async function crawlBatch(urls, timeoutMs = 90_000) {
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
        delay_before_return_html: 0.75,
        scan_full_page: true,
        remove_overlay_elements: true,
        process_iframes: true,
        check_robots_txt: true,
      } },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) throw new Error(`Crawl4AI returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const results = [];
  let buffer = "";
  const acceptLine = (line) => {
    if (!line.trim()) return;
    const parsed = JSON.parse(line);
    if (parsed?.status !== "completed") results.push(parsed.result || parsed);
  };
  for await (const chunk of response.body) {
    buffer += Buffer.from(chunk).toString("utf8");
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      acceptLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  if (buffer.trim()) acceptLine(buffer);

  const remaining = [...urls];
  return results.map((result) => {
    const resultHost = result?.url ? hostname(result.url) : "";
    const index = remaining.findIndex((url) => hostname(url) === resultHost);
    const requestedUrl = index >= 0 ? remaining.splice(index, 1)[0] : remaining.shift();
    return { requestedUrl, result };
  }).filter((entry) => entry.requestedUrl);
}

async function directFetch(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000), headers: { "user-agent": "Ramen Scout evidence verifier/1.0" } });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !bytes.length) throw new Error(`Direct HTTP fallback for ${url} returned ${response.status} and ${bytes.length} bytes.`);
  return { bytes, finalUrl: response.url || url, statusCode: response.status, contentType: response.headers.get("content-type") || "" };
}

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const urls = [...new Set(source.restaurants.flatMap((restaurant) => restaurant.evidence)
  .filter((evidence) => ["official_site", "official_menu"].includes(evidence.sourceType))
  .map((evidence) => evidence.url))].sort();
if (!urls.length) throw new Error("No first-party evidence URLs were found.");

if (process.env.CURATED_PRUNE_VERIFIED_REGISTRY === "1") {
  const existing = JSON.parse(await fs.readFile(outputPath, "utf8"));
  const byUrl = new Map(existing.records.map((record) => [record.url, record]));
  const records = urls.map((url) => byUrl.get(url));
  if (records.some((record) => !record?.success || !/^[a-f0-9]{64}$/.test(record.contentHash || ""))) {
    throw new Error("The verified evidence registry cannot be pruned because at least one current URL is missing or invalid; run a fresh Crawl4AI evidence build.");
  }
  const output = { ...existing, records };
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ records: records.length, reusedVerifiedRecords: records.length, outputPath }, null, 2));
  process.exit(0);
}

const health = await fetch(`${crawl4aiUrl}/health`, { signal: AbortSignal.timeout(10_000) });
if (!health.ok) throw new Error(`Crawl4AI health check returned ${health.status}.`);

let crawlResults;
if (process.env.CURATED_REUSE_CRAWL === "1") {
  const cache = JSON.parse(await fs.readFile(crawlCachePath, "utf8"));
  if (JSON.stringify(cache.urls) !== JSON.stringify(urls)) throw new Error("The cached Crawl4AI URL set does not match the current curated evidence URL set.");
  crawlResults = new Map(cache.records.map((entry) => [entry.url, entry.result]));
} else {
  crawlResults = new Map();
  const batches = batchesWithDistinctHosts(urls);
  for (const [index, batch] of batches.entries()) {
    let results = [];
    try {
      results = await crawlBatch(batch);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ event: "crawl4ai_evidence_batch_error", batch: index + 1, urls: batch, error: String(error?.message || error) })}\n`);
      for (const url of batch) {
        try {
          results.push(...await crawlBatch([url], 60_000));
        } catch (individualError) {
          results.push({ requestedUrl: url, result: { url, success: false, status_code: null, error_message: String(individualError?.message || individualError) } });
        }
      }
    }
    for (const entry of results) crawlResults.set(entry.requestedUrl, entry.result);
    process.stdout.write(`${JSON.stringify({ event: "crawl4ai_evidence_batch", batch: index + 1, batches: batches.length, urls: batch.length, results: results.length })}\n`);
    const progressRecords = urls.map((url) => ({ url, result: crawlResults.get(url) || null }));
    await fs.mkdir(path.dirname(crawlCachePath), { recursive: true });
    await fs.writeFile(crawlCachePath, `${JSON.stringify({ urls, records: progressRecords }, null, 2)}\n`, "utf8");
  }
  const compactRecords = urls.map((url) => {
    const result = crawlResults.get(url) || {};
    return { url, result: {
      url: result.url,
      redirected_url: result.redirected_url,
      success: result.success,
      status_code: result.status_code,
      response_headers: result.response_headers,
      markdown: result.markdown,
      error_message: result.error_message,
    } };
  });
  await fs.mkdir(path.dirname(crawlCachePath), { recursive: true });
  await fs.writeFile(crawlCachePath, `${JSON.stringify({ urls, records: compactRecords }, null, 2)}\n`, "utf8");
}

const records = [];
for (const url of urls) {
  const result = crawlResults.get(url);
  const markdown = normalizedPageText(result?.markdown?.raw_markdown || result?.markdown?.fit_markdown || (typeof result?.markdown === "string" ? result.markdown : ""));
  const statusCode = result?.status_code ?? null;
  const crawlSuccess = Boolean(result?.success) && statusCode !== null && statusCode < 400;
  const isPdf = /\.pdf(?:$|[?#])/i.test(url) || /application\/pdf/i.test(result?.response_headers?.["content-type"] || "");
  let record;
  if (isPdf) {
    const direct = await directFetch(url);
    record = {
      url,
      finalUrl: direct.finalUrl,
      success: true,
      statusCode: direct.statusCode,
      retrievedAt: new Date().toISOString(),
      extractionMethod: "direct_http_pdf_after_crawl4ai",
      contentType: direct.contentType,
      contentHash: sha256(direct.bytes),
      charCount: null,
      byteCount: direct.bytes.length,
      crawl4aiSuccess: crawlSuccess,
      crawl4aiMarkdownChars: markdown.length,
    };
  } else if (crawlSuccess && markdown.length >= 40) {
    record = {
      url,
      finalUrl: result?.redirected_url || result?.url || url,
      success: true,
      statusCode,
      retrievedAt: new Date().toISOString(),
      extractionMethod: "crawl4ai_normalized_markdown",
      contentType: result?.response_headers?.["content-type"] || "text/markdown",
      contentHash: sha256(markdown),
      charCount: markdown.length,
      byteCount: null,
      crawl4aiSuccess: true,
      crawl4aiMarkdownChars: markdown.length,
    };
  } else {
    const direct = await directFetch(url);
    record = {
      url,
      finalUrl: direct.finalUrl,
      success: true,
      statusCode: direct.statusCode,
      retrievedAt: new Date().toISOString(),
      extractionMethod: "direct_http_fallback_after_crawl4ai",
      contentType: direct.contentType,
      contentHash: sha256(direct.bytes),
      charCount: null,
      byteCount: direct.bytes.length,
      crawl4aiSuccess: crawlSuccess,
      crawl4aiMarkdownChars: markdown.length,
    };
  }
  records.push(record);
}

const output = {
  schemaVersion: "1.0",
  generatedAt: new Date().toISOString(),
  crawl4aiEndpoint: crawl4aiUrl,
  hashPolicy: "SHA-256 of normalized Crawl4AI markdown; PDFs and Crawl4AI-empty fallbacks use fetched response bytes.",
  records,
};
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ records: records.length, crawl4aiRecords: records.filter((record) => record.extractionMethod.startsWith("crawl4ai")).length, fallbackRecords: records.filter((record) => record.extractionMethod.startsWith("direct_http")).length, outputPath }, null, 2));
