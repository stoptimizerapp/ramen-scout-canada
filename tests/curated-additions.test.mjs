import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

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
    else if (character === "\n") { row.push(cell.endsWith("\r") ? cell.slice(0, -1) : cell); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const source = JSON.parse(fs.readFileSync(new URL("../data/curated-additions.source.json", import.meta.url), "utf8"));
const evidenceRegistry = JSON.parse(fs.readFileSync(new URL("../data/curated-evidence-registry.json", import.meta.url), "utf8"));
const placeRegistry = JSON.parse(fs.readFileSync(new URL("../data/curated-place-registry.json", import.meta.url), "utf8"));
const table = parseCsv(fs.readFileSync(new URL("../data/curated-additions.csv", import.meta.url), "utf8"));
const headers = table[0];
const rows = table.slice(1).filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
const evidenceByUrl = new Map(evidenceRegistry.records.map((record) => [record.url, record]));
const placesByKey = new Map(placeRegistry.records.map((record) => [record.candidateKey, record]));

test("curated overlay is exact, unique and registry-matched", () => {
  assert.equal(headers.length, 378);
  assert.equal(new Set(headers).size, 378);
  assert.equal(source.restaurants.length, 33);
  assert.equal(rows.length, 33);
  assert.equal(placeRegistry.records.length, 33);
  assert.deepEqual(
    placeRegistry.records.map((record) => record.candidateKey).sort(),
    source.restaurants.map((restaurant) => restaurant.sourceKey).sort(),
    "the checked place registry must contain exactly the accepted candidate set",
  );
  for (const field of ["restaurant_id", "source_google_place_id", "source_row_number", "canonical_path"]) {
    assert.equal(new Set(rows.map((row) => row[field])).size, 33, `${field} must be unique`);
  }
  for (const row of rows) {
    const place = placesByKey.get(row.source_row_number);
    assert.ok(place, `${row.name} must have checked Maps provenance`);
    assert.equal(row.source_google_place_id, place.googlePlaceId);
    assert.equal(row.google_maps_url, place.mapsUrl);
    assert.ok(Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)));
  }
});

test("curated claims have explicit, resolvable fetched evidence", () => {
  const requiredEvidenceUrls = [...new Set(source.restaurants.flatMap((restaurant) => restaurant.evidence)
    .filter((evidence) => ["official_site", "official_menu"].includes(evidence.sourceType))
    .map((evidence) => evidence.url))].sort();
  assert.deepEqual(evidenceRegistry.records.map((record) => record.url).sort(), requiredEvidenceUrls);
  assert.equal(new Set(evidenceRegistry.records.map((record) => record.contentHash)).size, evidenceRegistry.records.length);
  for (const row of rows) {
    const candidate = source.restaurants.find((restaurant) => restaurant.sourceKey === row.source_row_number);
    assert.ok(candidate, `${row.name} must join to its authored source`);
    const usedReferences = new Set();
    for (let slot = 1; slot <= 12; slot += 1) {
      const url = row[`evidence_${slot}_url`];
      if (!url) continue;
      const id = `E${slot}`;
      usedReferences.add(id);
      const evidence = candidate.evidence.find((entry) => entry.id === id);
      assert.ok(evidence, `${row.name} ${id} must resolve`);
      assert.match(row[`evidence_${slot}_content_hash`], /^[a-f0-9]{64}$/);
      if (["official_site", "official_menu"].includes(evidence.sourceType)) {
        assert.equal(row[`evidence_${slot}_content_hash`], evidenceByUrl.get(evidence.url)?.contentHash);
      } else if (evidence.sourceType === "licensed_maps_provider") {
        const place = placesByKey.get(row.source_row_number);
        const expectedMapsHash = sha256(JSON.stringify({
          candidateKey: place.candidateKey,
          googlePlaceId: place.googlePlaceId,
          mapsName: place.mapsName,
          mapsAddress: place.mapsAddress,
          latitude: place.latitude,
          longitude: place.longitude,
          mapsUrl: place.mapsUrl,
          retrievedAt: place.retrievedAt,
        }));
        assert.equal(row[`evidence_${slot}_content_hash`], expectedMapsHash, `${row.name} Maps evidence must hash the checked registry record`);
      }
    }
    for (let slot = 1; slot <= 3; slot += 1) {
      if (!row[`signature_${slot}_name`]) continue;
      const references = row[`signature_${slot}_evidence_refs`].split("|").filter(Boolean);
      assert.ok(references.length && references.every((reference) => usedReferences.has(reference)), `${row.name} signature ${slot} must have explicit evidence`);
    }
    for (let slot = 1; slot <= 4; slot += 1) {
      if (!row[`faq_${slot}_question`]) continue;
      const references = row[`faq_${slot}_evidence_refs`].split("|").filter(Boolean);
      assert.ok(references.length && references.every((reference) => usedReferences.has(reference)), `${row.name} FAQ ${slot} must have explicit evidence`);
    }
    const menuHashes = candidate.evidence
      .filter((evidence) => evidence.supports.includes("menu") && ["official_site", "official_menu"].includes(evidence.sourceType))
      .map((evidence) => evidenceByUrl.get(evidence.url)?.contentHash)
      .filter(Boolean)
      .sort();
    assert.equal(row.menu_content_hash, sha256(menuHashes.join("\n")), `${row.name} menu hash must derive from fetched source content`);
  }
});

test("curated rows remain high-information but fail closed", () => {
  const excludedKeys = [
    "sansotei-eglinton", "sansotei-nepean", "sansotei-laval",
    "poke-et-ramen-moi-drummondville", "poke-et-ramen-moi-trois-rivieres-hart",
    "ramen-isshin-ottawa", "poke-et-ramen-moi-gatineau", "ramen-misoya-toronto", "dorinku-tokyo-edmonton",
    "tako-halifax", "hojo-founders-charlottetown", "nans-avenida",
  ];
  for (const key of excludedKeys) assert.ok(!source.restaurants.some((restaurant) => restaurant.sourceKey === key), `${key} must remain excluded`);
  for (const row of rows) {
    assert.equal(row.publication_status, "needs_review");
    assert.equal(row.robots_directive, "noindex,follow");
    assert.equal(row.ads_allowed, "no");
    assert.equal(row.gate_human_review_pass, "no");
    assert.equal(row.gate_schema_pass, "no");
    assert.equal(row.gate_visible_schema_parity_pass, "no");
    assert.equal(row.gate_adsense_content_pass, "no");
    assert.equal(row.schema_validation_status, "not_run");
    assert.ok(Number(row.quality_score_0_100) >= 90);
    assert.ok(Number(row.verified_decision_field_count) >= 6);
    assert.ok(Number(row.publisher_content_word_count) >= 200);
    assert.equal(row.copy_qa_status, "pass");
    assert.equal(Number(row.copy_reused_sentence_count), 0);
    assert.ok(Number(row.copy_source_longest_match_tokens) < 8);
    assert.ok(Number(row.copy_word_5gram_jaccard_max) < 0.15);
    assert.equal(row.halal_status, "unknown");
    assert.equal(row.verified_halal_options, "unknown");
    assert.equal(row.external_rating_in_schema, "no");
    assert.equal(row.staging_media_publishable, "no");
    const candidate = source.restaurants.find((restaurant) => restaurant.sourceKey === row.source_row_number);
    assert.ok(!(candidate.reviewFlags || []).some((flag) => /(?:address|postal|identity)_conflict/.test(flag)));
    assert.equal(row.gate_identity_pass, "yes");
  }
});

test("Umi Sushi Ajax preserves the verified identity, complete menu and conservative unknowns", () => {
  const candidate = source.restaurants.find((restaurant) => restaurant.sourceKey === "umi-sushi-ajax");
  const row = rows.find((restaurant) => restaurant.source_row_number === "umi-sushi-ajax");
  const place = placesByKey.get("umi-sushi-ajax");

  assert.ok(candidate);
  assert.ok(row);
  assert.ok(place);
  assert.equal(candidate.googlePlaceId, "ChIJs5ZA4kff1IkRsKuEMza1Bb0");
  assert.equal(candidate.location.postalCode, "L1T 1P5");
  assert.equal(candidate.location.latitude, 43.8593479);
  assert.equal(candidate.location.longitude, -79.0393782);
  assert.equal(place.mapsName, "Umi Sushi");
  assert.equal(candidate.relevance.itemCount, 10);
  assert.equal(candidate.menu.items.length, 10);
  assert.deepEqual(
    candidate.menu.items.map((item) => [item.name, item.price]),
    [
      ["Chicken Yaki Ramen", 13.99],
      ["Beef Yaki Ramen", 13.99],
      ["Seafood Yaki Ramen", 13.99],
      ["Vegetable Yaki Ramen", 13.99],
      ["Chicken Soup Ramen", 14.99],
      ["Beef Soup Ramen", 14.99],
      ["Seafood Soup Ramen", 14.99],
      ["Vegetable Soup Ramen", 14.99],
      ["Chasu(Pork Belly) Ramen", 16.99],
      ["Blk Pepper Duck Breast Ramen", 16.99],
    ],
  );
  assert.equal(row.hours_mon, "11:00-22:00");
  assert.equal(row.hours_fri, "11:00-22:30");
  assert.equal(row.hours_sun, "11:00-22:00");
  assert.equal(row.ramen_price_observed_item_count, "10");
  assert.equal(row.ramen_price_min_cad, "13.99");
  assert.equal(row.ramen_price_max_cad, "16.99");
  assert.equal(row.ramen_price_median_cad, "14.99");
  assert.equal(row.has_tonkotsu, "unknown");
  assert.equal(row.has_shoyu, "unknown");
  assert.equal(row.has_miso, "unknown");
  assert.equal(row.has_tsukemen, "no");
  assert.equal(row.vegan_status, "unknown");
  assert.equal(row.halal_status, "unknown");
  assert.equal(row.house_made_noodles_status, "unknown");
  assert.ok(Number(row.quality_score_0_100) >= 95);
  assert.ok(Number(row.publisher_content_word_count) >= 300);
});

test("overnight and split hours preserve next-day semantics", () => {
  const byKey = new Map(rows.map((row) => [row.source_row_number, row]));
  const momo = byKey.get("momo-fredericton");
  assert.equal(momo.hours_fri, "11:00-02:00+1");
  assert.equal(momo.hours_sat, "11:00-02:00+1");
  assert.equal(momo.late_night_status, "yes");
  assert.match(momo.late_night_days, /Friday/);
  assert.equal(momo.late_night_latest_close, "02:00+1");
  const hus = byKey.get("hus-noodle-nook-edmonton");
  assert.equal(hus.hours_tue, "17:30-02:00+1", "contiguous midnight segments should become one overnight interval");
  assert.equal(hus.hours_sat, "18:00-02:00+1");
  const nana = byKey.get("nana-sushi-nanaimo");
  assert.equal(nana.late_night_status, "no", "a second same-day dinner interval must not be treated as next-day service");
  assert.equal(nana.late_night_latest_close, "");
});
