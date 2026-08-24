# Ramen Scout Canada

A static, evidence-led directory for finding ramen restaurants across Canada. The site is generated from the enriched CSV in the parent project and includes national discovery, province and city hubs, curated style and feature pages, client-side location sorting, and detailed restaurant pages.

## Local development

```bash
npm install
npm run dev
```

The data generator runs automatically before development and production builds.

## Curated additions

The original 378-column enrichment export remains immutable. Newly discovered restaurants are authored in `data/curated-additions.source.json`. `npm run data:evidence` refreshes the source-controlled Crawl4AI content-hash registry after an editorial source review; it is deliberately separate from normal builds. `npm run data:curated` then deterministically expands the manifest into the matching `data/curated-additions.csv`, and `npm run data:build` merges it before generating public route data.

An addition is rejected unless it has an authentic, unique Google Place ID; exact Canadian coordinates; matching current first-party and Maps identity details; a complete, reliable seven-day hours record; a current official item-level ramen menu; explicit taxonomy; at least two traceable evidence records fetched within the 120-day freshness window; six evidence-backed fact groups; a deterministic staging score of at least 90; and at least 200 words of unique, useful publisher content. Unknown dietary, service, price and noodle facts remain `unknown`, never inferred as `no`. Opening-soon, temporarily closed, thin, identity-conflicted, incomplete-hours and first-party-unverifiable candidates stay out.

Restaurant IDs use `ramen_ca_` plus the first 20 hexadecimal characters of SHA-256 over normalized name, branch, street and postal code. Brand IDs use the equivalent first 16 characters over the normalized brand name. The quality score is also deterministic: official identity (15), ramen relevance (15), current item-level menu (15), complete hours (10), explicit taxonomy (10), evidence coverage (10), original content (10) and freshness (5), plus five points for observed ramen prices and one point each for an explicit vegan, noodle, reservation or service decision group, capped at 100. These data-quality scores do not authorize publication.

Every curated row remains `needs_review`, `noindex,follow`, ad-disabled and blocked on human review, rendered-schema validation and visible-schema parity. Source prose, external ratings and third-party photos are not published. A separate `data/publication-approvals.json` registry is the only supported review-to-publication path: approvals are tied to exact content, evidence, schema-input and renderer/canonical-origin hashes, a named reviewer and non-future review timestamps.

## Verification

```bash
npm run lint
npm test
```

`npm test` rebuilds the directory and checks route/data uniqueness, public search-field safety, rendered metadata, schema output, preview robots rules, representative routes, security headers, and true 404 responses.

## Publication gate

The default build is a research preview:

- every page is `noindex`;
- `robots.txt` disallows crawling;
- the sitemap is empty;
- no advertising or third-party rating code is loaded;
- unlicensed restaurant media is excluded.

Do not set `NEXT_PUBLIC_ALLOW_INDEXING=true` until the publication gates pass and the custom domain, monitored contact addresses, final human review, and corrections workflow are operational. The build-time gate filters indexable output to hash-matched approvals and fails closed unless at least 50 approved restaurants span 15 cities and five provinces.

## Environment

```bash
NEXT_PUBLIC_SITE_URL=https://ramenscout.ca
NEXT_PUBLIC_ALLOW_INDEXING=false
```

`NEXT_PUBLIC_SITE_URL` controls canonical and social URLs. Keep indexing disabled on preview deployments.
