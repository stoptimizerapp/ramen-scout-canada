# Ramen Scout Canada

A static, evidence-led directory for finding ramen restaurants across Canada. The site is generated from the enriched CSV in the parent project and includes national discovery, province and city hubs, curated style and feature pages, client-side location sorting, and detailed restaurant pages.

## Local development

```bash
npm install
npm run dev
```

The data generator runs automatically before development and production builds.

Freshness supplements for strong existing listings are refreshed separately with `npm run data:readiness`. That command uses Crawl4AI to revisit the exact first-party menu URLs already attached to near-ready records. A small reviewed `data/search-readiness-menu-enrichments.json` ledger can correct missing item-level menu facts before the crawl, but only with explicit evidence references and conservative unknowns. The supplement registry stores only source URLs, retrieval times, HTTP status, normalized-content hashes and corroboration counts—not copied source prose. Normal builds never crawl external sites.

## Curated additions

The original 378-column enrichment export remains immutable. Newly discovered restaurants are authored in `data/curated-additions.source.json`. `npm run data:evidence` refreshes the source-controlled Crawl4AI content-hash registry after an editorial source review; it is deliberately separate from normal builds. `npm run data:curated` then deterministically expands the manifest into the matching `data/curated-additions.csv`, and `npm run data:build` merges it before generating public route data.

An addition is rejected unless it has an authentic, unique Google Place ID; exact Canadian coordinates; matching current first-party and Maps identity details; a complete, reliable seven-day hours record; a current official item-level ramen menu; explicit taxonomy; at least two traceable evidence records fetched within the 120-day freshness window; six evidence-backed fact groups; a deterministic staging score of at least 90; and at least 200 words of unique, useful publisher content. Unknown dietary, service, price and noodle facts remain `unknown`, never inferred as `no`. Opening-soon, temporarily closed, thin, identity-conflicted, incomplete-hours and first-party-unverifiable candidates stay out.

Restaurant IDs use `ramen_ca_` plus the first 20 hexadecimal characters of SHA-256 over normalized name, branch, street and postal code. Brand IDs use the equivalent first 16 characters over the normalized brand name. The quality score is also deterministic: official identity (15), ramen relevance (15), current item-level menu (15), complete hours (10), explicit taxonomy (10), evidence coverage (10), original content (10) and freshness (5), plus five points for observed ramen prices and one point each for an explicit vegan, noodle, reservation or service decision group, capped at 100. These data-quality scores do not authorize publication.

Every curated data row remains `needs_review`, ad-disabled and blocked from the approval-gated advertising cohort until human review, rendered-schema validation and visible-schema parity are complete. Public page indexing is configured separately. Source prose, external ratings and third-party photos are not published. A separate `data/publication-approvals.json` registry remains the only supported review-to-advertising path: approvals are tied to exact content, evidence, schema-input and renderer/canonical-origin hashes, a named reviewer and non-future review timestamps.

## Verification

```bash
npm run lint
npm test
```

`npm test` rebuilds the directory and checks route/data uniqueness, public search-field safety, rendered metadata, schema output, preview robots rules, representative routes, security headers, and true 404 responses.

## Publication gate

The GitHub Pages release permits crawling with `NEXT_PUBLIC_ALLOW_STATIC_INDEXING=true`, but indexing is deliberately quality-gated. Editorial, support and policy pages are indexable. A restaurant enters the sitemap only when it has substantial unique publisher content, primary or substantial ramen relevance, a current official menu, fresh source evidence, at least six verified decision fields and a quality score of 90 or better. A Crawl4AI supplement can correct a stale legacy score only when its exact menu URL, timestamp, content hash and independently recomputed live fact profile all match; it cannot override identity, relevance, evidence, originality, rights or freshness failures. City, province, style and feature hubs must also clear minimum useful-inventory thresholds. Other canonical pages remain accessible with `noindex,follow`; internal search and query/filter variants are always excluded because they duplicate canonical inventory.

The approval-gated advertising cohort remains independently fail-closed. Do not set `NEXT_PUBLIC_ALLOW_INDEXING=true` until the listing gates pass and the monitored contacts, human review and corrections workflow are operational. That build-time gate filters the approved cohort to hash-matched records and aborts unless at least 50 approved restaurants span 15 cities and five provinces. Advertising and third-party rating code remain disabled, and unlicensed restaurant media is excluded.

## GitHub Pages

`npm run build:pages` creates a complete static artifact in `pages-out/`. The GitHub Actions workflow deploys that artifact, including every restaurant, city, province, style, feature and policy route, to `ramenscout.ca`. DNS remains hosted at the registrar; the apex and `www` records point to GitHub Pages.

## Environment

```bash
NEXT_PUBLIC_SITE_URL=https://ramenscout.ca
NEXT_PUBLIC_ALLOW_STATIC_INDEXING=true
NEXT_PUBLIC_ALLOW_INDEXING=false
```

`NEXT_PUBLIC_SITE_URL` controls canonical and social URLs. Set `NEXT_PUBLIC_ALLOW_STATIC_INDEXING=false` on private previews. `NEXT_PUBLIC_ALLOW_INDEXING` remains the separate approval-gated advertising cohort switch and stays disabled until the approval registry and national launch gate pass.

## Search-engine discovery

The canonical sitemap is advertised in `robots.txt` and submitted to Google and Bing webmaster tools. A root IndexNow ownership key and `npm run search:submit` notify all participating IndexNow engines about every canonical sitemap URL; the GitHub Pages workflow repeats that notification after successful deployments.
