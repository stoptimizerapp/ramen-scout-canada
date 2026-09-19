# AdSense resubmission remediation — 19 September 2026

This supersedes the unresolved thin-page inventory in README.md, report.json and
the earlier VALIDATION.md. Those files record the previous, enrichment-only pass.
Google alone decides approval; this is an editorial and technical remediation,
not a guarantee of approval or a claim that every restaurant was visited.

## Publication decisions

- Preserve all 413 restaurant records and existing nearby-search functionality.
- Retain 29 individually reviewed restaurant guides, 29 multi-operator city
  comparisons and seven provincial hubs. Short menu extracts and unverified
  contact records now have permanent anchors inside relevant comparison hubs.
- Consolidate 384 standalone restaurant pages (222 contact-only records and 162
  short menu extracts), 76 sparse city pages and three sparse province pages.
  `data/content-publication.json` records every restaurant decision and all 463
  destinations. Source records remain recoverable in the data and Git history.
- No internal navigation points at the retired pages. GitHub Pages serves
  immediate HTML redirects with a destination canonical, noindex and a visible
  fallback link; these are not HTTP 301 responses. The private runtime uses 308s.
- The original search-evidence gate remains conservative. A useful comparison
  hub can remain noindex until its existing evidence gate is satisfied. Noindex
  was not used as a substitute for consolidating the weak standalone cohort.

The retained guides were selected for practical menu choices and attributable
visit information, not merely a minimum word count. Shared branch menus are
identified as such. Consolidated entries show concise facts instead of padding
each record with generic advice. Contact-only entries clearly distinguish an
unverified menu from a documented bowl. Unconfirmed vegan item names are not
presented as explicitly vegan.

## Factual corrections and useful content

The preceding enrichment pass added researched menu comparisons and an original
ordering guide. This pass additionally rechecked 17 source URLs with Crawl4AI,
followed Shiawase's actual menu, and replaced its review-derived ramen example
with nine named, priced menu bowls. Prices distinguish topping versus stock,
delivery versus dine-in, and starting versus fixed prices when the source does.
New caveats cover Tsukuyomi's branch-menu scope, Misoya's delivery pricing,
Nana Sushi's starting prices/seasonal bowl and Dojo's egg-containing vegetarian
bowl. Old evidence dates were not globally changed to today's date.

Raw source captures remain private local research, not republished page copy:

- `outputs/quality-20260919/final-checks-raw.jsonl`, SHA-256
  `c54bc455717938d858b8d70f8e11888f6ef39cd9003784d3b685f6d61fbc3f95`
- `outputs/quality-20260919/shiawase-menu.json`, SHA-256
  `9f51d51785b843d34a90fddce1d927042449c97df82cfaebd711c2c74fc71e03`

## Publisher, privacy and account checks

- Intended deployment: `stoptimizerapp/ramen-scout-canada` → `ramenscout.ca`.
- AdSense publisher `pub-2494233247909241`; the site account view reports
  ads.txt **Authorised**, with the existing **Low value content** rejection.
- Account Policy centre shows no additional current issues. This does not
  override the site's rejection or imply approval.
- A European-regulations message explicitly for ramenscout.ca is Published.
- Ramen Scout is absent from the account's Auto ads site list. No ad-serving
  loader or manual ad unit is published; ownership metadata and ads.txt remain.
- Optional Firebase Analytics now stays off until the visitor opts in. A footer
  control permits withdrawal and removal of accessible Analytics cookies. The
  privacy policy describes the actual behavior. This control is not a substitute
  for Google's required ad-consent integration if ad serving is enabled later.
- No ad clicks, review request, unrelated account changes or DNS changes made.

## Verification scope

The final validation covers rendered HTML, all redirect targets and anchors,
canonical/robots/sitemap consistency, structured data, internal routes, ad-code
absence, privacy-source invariants and nearby-search regression tests. It is not
a live mobile/desktop visual review or a test of Google's reviewer decision.
No browser visual QA was performed in this turn under the Sites workflow rule.
The known standalone TypeScript ambient-type issues from the earlier report are
outside the static production build and remain separately recorded there.

Readiness is for another review of the changed site, not a promise of ad serving.
Review must be requested only after the new public deployment is verified.

### Final local results

- Production-origin build and ESLint passed; all 36 regression tests passed.
- 548 static routes plus 404: 84 canonical content pages, 463 consolidation
  redirects and search. All redirect destinations and record anchors resolve.
- 62 indexable canonical pages, 22 conservatively noindex canonical pages.
  Indexable inventory: 28 restaurant guides, 12 cities, four provinces, four
  styles, three feature guides and 11 core/editorial/policy pages.
- Sitemap exactly matches that 62-page inventory; no retired path is included.
- 30 structured-data blocks parse; imported review/rating schema is absent.
- Static AdSense audit across all 549 HTML files: zero errors and warnings,
  zero ad loaders or manual units, matching publisher metadata and ads.txt.
- Restaurant editorial five-gram overlap maximum: 0.1383. This is a regression
  signal only, not proof of originality or a substitute for editorial review.
