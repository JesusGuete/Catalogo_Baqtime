# Catalogo Baqtime

Static storefront and admin panel for Baqtime (personalized bags, totes, and neceseres). No build step, no bundler, no test runner — `index.html` and `admin.html` are served as-committed by GitHub Pages.

## Running locally

Both pages load their JavaScript as ES modules (`<script type="module" src="...">`). ES modules are fetched with CORS semantics by the browser and **will not load over `file://`** — opening `index.html` by double-clicking it renders a blank page with console errors. You must serve the files over HTTP:

```bash
cd /path/to/Catalogo_Baqtime
python3 -m http.server 8000
```

Then open:

- Storefront: http://localhost:8000/
- Admin panel: http://localhost:8000/admin.html

Production (GitHub Pages, `https://baqtime.store`) is unaffected by this restriction — it always serves over HTTPS.

## Project structure

```
/
├── index.html              storefront markup only
├── admin.html               admin panel markup only (noindex)
├── CNAME
├── robots.txt
├── sitemap.xml
├── favicon.svg
└── assets/
    ├── css/                 site.css, admin.css — one stylesheet per page
    ├── img/                 first-party fallback assets (e.g. placeholder.svg)
    └── js/
        ├── shared/           escape.js — used by both pages
        ├── site/             storefront ES modules (state, catalog data, rendering, etc.)
        └── admin/            admin panel ES modules (draft store, product cards, crop editor, etc.)
```

## Firebase is an enrichment layer, not a hard dependency

The storefront renders the full catalog synchronously from static data in `assets/js/site/catalog-data.js` on first paint. Firebase Realtime Database is only consulted afterward to apply photo/name/order overrides and any admin-managed additions or deletions. If Firebase is blocked, slow, or unreachable, the catalog still renders — only the enrichment step is skipped.

There is intentionally no `images/` folder in this repository. Static product image paths resolve through `resolveProductImage()` (`assets/js/site/site-images.js`), which falls back to a local, same-origin `assets/img/placeholder.svg` for any product without a real (Firebase-hosted) photo yet, instead of a broken image icon.

## JSON-LD staleness note

Structured data (`Product`/`ItemList` JSON-LD) is generated at runtime from the same static arrays in `catalog-data.js`, not from Firebase. This is deliberate — Firebase-sourced data (via the currently open RTDB write rules) could otherwise be used to inject arbitrary structured data by an anonymous party. Consequences: a custom product created only in the admin panel never appears in structured data, and an admin rename of an existing product will not be reflected in JSON-LD until `catalog-data.js` is edited in the repository. Prices never drift, since Firebase never writes `price`.

## Category placeholder images

`resolveProductImage()` also supplies a same-origin fallback for the three categories (`tote`, `neceser`, `lumiere`) that already have a public `site-images/*` asset, plus the three categories (`tote-luxury`, `cosmetiquera`, `makeup-bag`) that currently share the general `hero_collage_v2.webp` collage image as a placeholder until dedicated category photography exists. Swapping any of these mappings is a one-line change in `site-images.js`.

## GitHub web UI upload — the stale-file footgun

**GitHub's folder drag-and-drop upload adds and overwrites files, but never deletes them.** If you ever rename or move a file under `assets/` through the GitHub web UI, the old path is *not* removed — it stays committed and keeps being served, silently, alongside the new one.

Standing convention for this repository:

- **Do not rename files under `assets/` via the GitHub web UI.** If a rename is unavoidable, manually delete the old path through the web UI in the same session as the rename.
- Prefer a local `git clone` (or GitHub Desktop) for any change that touches more than a couple of files, and drag the whole `assets/` folder as one upload rather than hand-picking individual files.

This landing (the `separate-concerns-and-seo` change) does not itself perform any rename — all three pre-existing root files (`index.html`, `admin.html`, `CNAME`) are only modified, never renamed — so it does not trigger this footgun. It will matter on any *future* change that reorganizes `assets/`.
