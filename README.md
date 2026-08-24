# Ramen Scout Canada

A static, evidence-led directory for finding ramen restaurants across Canada. The site is generated from the enriched CSV in the parent project and includes national discovery, province and city hubs, curated style and feature pages, client-side location sorting, and detailed restaurant pages.

## Local development

```bash
npm install
npm run dev
```

The data generator runs automatically before development and production builds.

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

Do not set `NEXT_PUBLIC_ALLOW_INDEXING=true` until the CSV publication gates pass and the custom domain, monitored contact addresses, final human review, and corrections workflow are operational. The build-time gate filters indexable output to approved records and is intended to fail closed.

## Environment

```bash
NEXT_PUBLIC_SITE_URL=https://ramenscout.ca
NEXT_PUBLIC_ALLOW_INDEXING=false
```

`NEXT_PUBLIC_SITE_URL` controls canonical and social URLs. Keep indexing disabled on preview deployments.
