# Low-value-content remediation, September 19, 2026

## What was actually confirmed

The authenticated AdSense Sites page for `ramenscout.ca`, publisher
`pub-2494233247909241`, reports **Low value content**, updated September 16.
The site's ads.txt is **Authorised**. No example URL was supplied in the notice.
No new review was requested during this pass.

Google's documentation reviewed:

- https://support.google.com/adsense/answer/7299563
- https://support.google.com/adsense/answer/12176698
- https://support.google.com/adsense/answer/10502938

## Findings and scope

The earlier internal word/score/source-count checks were technical safeguards,
not evidence of sufficient original value. Several older enrichments appended new
facts without removing statements that those same facts were unavailable. The
listing renderer repeated information as a summary, overview, why-go paragraph,
best-for paragraph, visit tip and FAQ. Related listings were alphabetical rather
than geographically near. Basic no-menu records appeared alongside researched
menus without a useful distinction.

This pass changes the shared templates but does not call all 413 listings
individually researched. Ten branch menus were materially expanded from current
official sources; four other listings had obsolete contradictory sentences
removed while keeping their original source dates. Sixteen Sansotei menu links
were repaired without claiming its location-variable brand menu verifies every
branch. A new first-party synthesis guide compares actual menu choices and
clearly labels calculations and research limitations.

The public GitHub Pages site remains static. No ad-serving script, ad slot,
Auto ads setting, consent configuration, DNS or Cloudflare account setting was
changed. Existing publisher ownership metadata and ads.txt are retained.

## Remaining decision

There are still 222 listings without item-level menus and two further noindex
listings with menu facts but incomplete pre-existing search-readiness gates.
They remain noindex and unmonetized. This does **not** exempt them from a
site-wide AdSense quality review. The owner was asked whether to consolidate
contact-only pages into city pages or keep enriching the standalone pages.
No mass deletion, consolidation or indexing promotion was applied without that
choice. All existing 189 indexable restaurant paths are preserved.

Do not tell the owner the rejection is fully resolved or resubmit on the
strength of a passing build. The unresolved cohort remains material.

## Evidence and reproducibility

`report.json` contains the before/after inventory, route continuity and capture
hashes. `urls.txt` records the first Crawl4AI batch. Full captured third-party
Markdown and downloaded menu images stay in ignored `outputs/quality-20260919/`
for local verification, not in the public site or repository. Persisted menu
facts are in `data/search-readiness-menu-enrichments.json`; source and document
hashes are in `data/search-readiness-supplements.json`.

`scripts/review-september-menus.mjs` merges the item-level review. The targeted
`RESTAURANT_IDS` mode in `scripts/build-search-readiness-supplements.mjs` verifies
only that chosen cohort and preserves unrelated captures. It fails closed if
any selected source fails. Capturing a new menu is allowed without promoting a
restaurant whose separate search gate still fails (Shiki Menya remains noindex).

Do not refresh old verification dates merely because a renderer or sentence was
edited. Do not infer on-site noodle production from "made daily," or vegan
suitability from a vegetarian item, tofu topping or broth name.
