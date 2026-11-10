# Zhai Auto microsite (live)

Dealer microsite for **Zhai Auto, George** (Peugeot, Citroën, Opel, Jeep, Fiat), built and managed by [Conversion Advantage](https://conversionadvantage.co.za).

- **This repo:** the live site, hosted on Cloudflare Pages at https://zhaiauto-live.pages.dev/ (moving to https://zhaiauto.co.za/).
- **Staging / preview:** the separate `zhaiauto_staging` repo. Changes are approved there first.

## Please don't edit the site files here directly

`index.html`, `privacy.html` and `img/` are exports. The master working copy (with the built-in editor, build notes and backups) lives in the Zhai Auto client folder on the Conversion Advantage Google Drive. Changes made directly on GitHub will be overwritten by the next export.

## What's in the repo

| Path | What it is |
|---|---|
| `index.html` | The whole one-page site (layout, code and stock data in one file), exported from the master copy |
| `privacy.html` | POPIA privacy notice, linked from the footer and the form consent box |
| `img/` | Original car photos (`img/cars/`), site images, brand logos, video loops, fonts (`img/fonts/`), favicons and the older phone copies (`img/m/`, only used by unbuilt copies such as staging) |
| `build/build.mjs` | The build Cloudflare runs on every push (see below). Repo-only: never overwritten by an export |
| `package.json`, `package-lock.json`, `.node-version` | Build setup (one dependency: `sharp`, for the photo sizes) |
| `_headers` | Cloudflare caching and security headers; noindex for the pages.dev addresses (master copy: `website/_headers-live`) |

## The build (since 10 Nov 2026)

Cloudflare Pages settings (project `zhaiauto-live` › Settings › Build): **Build command** `npm run build`, **Build output directory** `dist`, **Environment variable** `SITE_URL` = the main address (`https://zhaiauto-live.pages.dev/` until the domain moves, then `https://zhaiauto.co.za/`).

On every push the build (about 40 seconds) makes `dist/`:

- **Photos in several sizes:** every photo the site uses becomes WebP at 480/800/1200/1600/2400 px wide (never wider than the original), named with a content hash (`img/r/cars/<photo>.<hash>.<width>.webp`). The page picks the smallest size that is sharp enough for the visitor's screen. A changed photo gets a new hash, so these files are cached for a year. The two banner videos get hashed names the same way.
- **A page per car:** `cars/<slug>/` for every car shown on the site, with its own title, description, share image (WhatsApp/Facebook preview), Car data for Google and a plain-HTML summary. The same site code opens the car full screen. On the home page, opening a car shows that address, and Back closes the car.
- **sitemap.xml, robots.txt, 404.html** (sold cars and old links land on a "this car has been sold" page instead of the home page).

Nothing in the exported files is changed by hand; the build only adds to them. Run it locally with `npm install` and `SITE_URL=https://zhaiauto.co.za/ npm run build`, then serve `dist/`.

## How updates happen

1. Stock is checked weekly against the dealer's cars.co.za listings (Pre-owned and Demo models), plus monthly specials.
2. Changes are made in the master working copy, checked (pre-launch check) and exported.
3. The export is committed to `zhaiauto_staging` and reviewed.
4. The same files (`index.html`, `privacy.html`, `img/`) are then committed here and pushed. Leave `build/`, `package*.json`, `.node-version`, `_headers` and this README in place. Cloudflare rebuilds and redeploys in a minute or two.
