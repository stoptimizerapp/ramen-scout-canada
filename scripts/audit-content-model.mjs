import fs from "node:fs/promises";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { isRestaurantSearchReady } from "../lib/search-readiness.js";
const root = new URL("../", import.meta.url);
const current = JSON.parse(await fs.readFile(new URL("data/restaurants.json", root), "utf8"));
const baselineRef = process.argv[2] || "a313808";
const before = JSON.parse(execFileSync("git", ["show", `${baselineRef}:data/restaurants.json`], { encoding: "utf8", maxBuffer: 20_000_000 }));
const old = new Map(before.map((r) => [r.id, r]));
const beforeIndexed = new Set(before.filter((r) => isRestaurantSearchReady(r)).map((r) => r.canonicalPath));
const afterIndexed = new Set(current.filter((r) => isRestaurantSearchReady(r)).map((r) => r.canonicalPath));
const changedMenus = current.filter((r) => JSON.stringify(r.menu.items) !== JSON.stringify(old.get(r.id)?.menu.items));
const sourcesPath = new URL("outputs/quality-20260919/crawls.jsonl", root);
const captures = (await fs.readFile(sourcesPath, "utf8")).trim().split("\n").map(JSON.parse);
for (const name of ["sansotei-home", "sansotei-menu"]) captures.push(JSON.parse(await fs.readFile(new URL(`outputs/quality-20260919/${name}.json`, root), "utf8")));
const report = {
  auditedAt: new Date().toISOString(), baselineRef,
  notice: { domain: "ramenscout.ca", publisher: "pub-2494233247909241", verifiedReason: "Low value content", dashboardUpdated: "2026-09-16", adsTxt: "Authorised", reviewRequestedThisPass: false },
  caveat: "A technical or internal content-score pass is not an AdSense approval assessment. Noindex does not exempt weak public pages from site-wide review.",
  inventory: { restaurants: current.length, cities: 105, indexableRestaurants: afterIndexed.size, noindexRestaurants: current.length - afterIndexed.size, withoutItemLevelMenus: current.filter((r) => !r.menu.items.length).length },
  improvements: {
    reviewedMenus: changedMenus.map((r) => ({ id: r.id, name: r.name, path: r.canonicalPath, beforeItems: old.get(r.id)?.menu.items.length, afterItems: r.menu.items.length, checked: r.menu.verifiedAt })),
    correctedMenuLinks: current.filter((r) => r.evidence.some((e) => e.id === "LINK1")).map((r) => r.canonicalPath),
    templates: ["413 listing routes: redundant overview/why-go/best-for/FAQ/visit-tip blocks removed; known facts and actual menu examples retained", "413 listing routes: geo-ranked alternatives with named dishes where coordinates and a researched menu exist within 60 km", "105 city routes: item-level comparison when available, separate compact contact-only records, nearby alternatives for sparse menu coverage", "8 style/feature routes: decision guidance, precisely matched bowl examples, source dates", "Homepage: diverse city/brand selection and new researched guide", "One original menu-comparison guide with six restaurants, arithmetic, ingredient distinctions and source methodology"],
  },
  searchContinuity: { lostIndexedRestaurantPaths: [...beforeIndexed].filter((p) => !afterIndexed.has(p)), addedIndexedRestaurantPaths: [...afterIndexed].filter((p) => !beforeIndexed.has(p)), changedRestaurantCanonicals: current.filter((r) => old.get(r.id)?.canonicalPath !== r.canonicalPath).map((r) => r.id) },
  unresolved: ["222 contact-only restaurant pages still lack item-level menus; consolidation versus further enrichment was put to the owner", "Two additional noindex restaurants have menu facts but do not clear all pre-existing search-readiness gates", "The 189 indexable listings have not all received an individual editorial rewrite in this pass", "Legacy prose/evidence remains on many listings; generated comparisons supplement it but do not establish firsthand experience or guaranteed originality", "No AdSense re-review requested; publisher decision and additional cohort work remain"],
  sources: captures.map((c) => ({ requestedUrl: c.url, crawlerSuccess: c.success, usableForMenuFacts: c.success && !/ERROR: PAGE NOT FOUND/.test(c.markdown || ""), soft404: /ERROR: PAGE NOT FOUND/.test(c.markdown || ""), markdownChars: c.markdown?.length || 0, sha256: crypto.createHash("sha256").update(c.markdown || "").digest("hex"), capturedOn: "2026-09-19", note: /shikimenya/.test(c.url) ? "Linked menu image visually transcribed; document hash is in supplements" : /yoka/.test(c.url) ? "Production/reservation text read; menu image not used for new item claims" : /arashi/.test(c.url) ? "Brand description only; no new branch-level claims applied" : "" })),
};
await fs.writeFile(new URL("research/2026-09-19-quality/report.json", root), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ inventory: report.inventory, changedMenus: changedMenus.length, correctedLinks: report.improvements.correctedMenuLinks.length, searchContinuity: report.searchContinuity }, null, 2));
