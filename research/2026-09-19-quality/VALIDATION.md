# Validation before publication

- Production-origin static build: passed.
- ESLint: passed.
- Rendered-page, menu-comparison and search regression tests: 35 passed.
- Static export: 548 routes plus the error page.
- Canonical/robots/sitemap audit: 547 canonical pages; 223 indexable, 324 noindex.
- Restaurant indexing continuity: all 189 previous indexable restaurant URLs
  retained; 224 restaurant URLs remain noindex. The added indexable URL is the
  researched menu-comparison guide.
- AdSense static audit: no errors or warnings, correct publisher and seller
  record, no ad-serving loaders/manual units on any route.
- Existing geolocation and sparse-city fallback regression tests pass.
- No live ads were clicked or requested as part of testing.

These tests are technical checks, not an AdSense quality endorsement. The
remaining low-data cohort is described in README.md and report.json.

Additional limitation: a standalone TypeScript check still reports the existing
empty-approval-array inference in lib/directory.ts and missing ambient Cloudflare
Fetcher/D1Database types in worker/index.ts. These were not introduced or changed
by this remediation and do not prevent the established static build. A new
desktop/mobile visual browser review was not performed in this pass; the
existing responsive layout was retained, with scroll-contained comparison tables.
