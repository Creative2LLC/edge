# SEO & social sharing

## The one rule that governs everything here

**Social scrapers do not run JavaScript.** Facebook, LinkedIn, X, iMessage and Slack read
the raw HTML the server returns. A meta tag added by a script is invisible to every one of
them, so nothing in `scripts/` can fix a missing share tag. Only two places work:

| Source | Used for |
| --- | --- |
| `head.html` | site-wide constants an author never varies |
| **Page Properties** in the Universal Editor | everything else, per page |

## What an author fills in

Open the page in the Universal Editor → **Page Properties**. Every field carries its own
guidance in the rail; the summary:

| Field | Fills | Notes |
| --- | --- | --- |
| Page Title | `<title>`, `og:title`, `twitter:title` | Under 60 chars, distinctive words first |
| Meta Description | `description`, `og:description`, `twitter:description` | 120–160 chars |
| Keywords | this site's search only | Google has ignored this tag for years |
| **Social Share Image** | `og:image`, `twitter:image` | 1200×630. Defaults to the first image on the page |
| **Social Share Title / Description** | `og:title` / `og:description` | Optional overrides when the shareable wording should differ from the SEO wording |
| **Content Type** | `og:type` | Article for news and blog, Website otherwise |
| **Language** | `og:locale` | Set Spanish on `/es` pages |
| **Search Engine Visibility** | `robots` | No Index for thank-you and test pages |
| **Canonical URL** | `<link rel="canonical">` | Only when this page duplicates another |

The bolded rows are new. Everything else was already there.

### og:image:alt cannot be a page property

An AEM page property becomes a JCR property, and a JCR name is `prefix:localname` — exactly
one colon. `og:image:alt` needs two, so it is not a nameable property and the xwalk linter
rejects it. This is a platform limit, not a lint nit; no field name works around it.

The tag itself is fine, it just has to come from the **bulk metadata sheet** at
`/metadata.json`, whose column headers are ordinary spreadsheet strings rather than JCR
names. Add a `URL` column plus an `og:image:alt` column and the value applies to matching
paths, wildcards included.

That sheet is currently empty. It is also the right home for any other multi-colon tag
(`og:image:width`, `og:image:height`, `article:published_time`) if those are wanted later.

### The share image is the one worth setting deliberately

If it is left empty, EDS uses **the first image on the page** — often a cropped hero or a
decorative icon, and whatever an author happens to put at the top later silently becomes
the share image. Set it explicitly on anything you expect to be shared: campaign pages,
resources, news.

## What is site-wide

In `head.html`, applying to every page:

- `og:site_name` — National Center for Missing & Exploited Children
- `twitter:site` — `@missingkids`
- `theme-color`
- **Organization structured data** (`NGO` schema) — name, logo, verified social accounts
  and the 1-800-THE-LOST hotline. This is what Google uses to build a knowledge panel and
  to connect this domain to NCMEC's real social accounts.

Deliberately **not** here: anything an author can set per page. A hardcoded `og:type` in
`head.html` would sit alongside an author's choice as a second, competing tag, and scrapers
pick between duplicates unpredictably. Constants only.

The social handles came from the legacy site (`aem-c2-copy`), not from the new footer —
the new footer's social links are still placeholders (`/facebook`, `/x`, `/insta`,
`/youtube`) and need real URLs before launch.

## Languages

English lives at the root and Spanish mirrors it under `/es` with the **same slugs**
(`/amber-alerts` and `/es/amber-alerts`). That one rule drives three things:

- `<html lang>` — `getPageLanguage()` in `scripts/scripts.js` sets `es` under `/es`,
  `en` everywhere else.
- **hreflang** — `helix-sitemap.yaml` pairs pages that share a path as alternates, with
  English as `x-default`. It lives in the sitemap rather than in each page's `<head>`
  because EDS cannot render a `<link rel="alternate">` from page metadata, and a script
  would have to probe for the other version on every page view (a logged 404 on almost
  every English page, which costs the Lighthouse best-practices score). Google treats
  sitemap hreflang the same as head tags.
- **Redirects** — old Spanish URLs (`/es/<old path>`) go to the English page until the
  Spanish twin is live; rerunning `scripts/legacy-redirect-map.mjs` then points them at it.

A Spanish page with a translated slug breaks the pairing. If one is ever needed, EDS
supports a `primary-language-url` page property for it (see aem.live/developer/sitemap).

EDS reads `helix-query.yaml` and `helix-sitemap.yaml` from `main`, so neither takes effect
from `test`. Index changes only apply to pages published afterwards: re-publish the `/es`
pages (or bulk re-index) once this reaches `main`, or `/es/about` stays in the English list.

## Auditing what is actually published

```bash
node audits/seo-meta-audit.mjs          # every page's title/description/share image
node audits/social-tags-check.mjs       # site-wide tags land, nothing duplicated, CSP clean
```

`seo-meta-audit.mjs` reads the published HTML, not the model — the model says what an
author *could* fill in, the audit says what they actually did. Run it against production
with `--base https://www.ncmec.org`.

## Known content gaps (2026-09-10, 93 indexable pages)

These are authoring tasks, not code:

| Count | Issue |
| --- | --- |
| 51 | description over 160 chars — truncated mid-sentence in results |
| 16 | no meta description at all |
| 2 | placeholder description, **including the homepage** ("This is the description") |
| 1 | title over 60 chars |
| 4 pairs | duplicate titles, incl. two real pages both titled "CyberTipline Data" |
| 58 | share image with no alt text (needs the metadata sheet, see above) |

The homepage one is worth fixing first: it is the description Google shows for the site's
most-linked page.
