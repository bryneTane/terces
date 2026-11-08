# Terces

> See what your photo gives away. Then cloak it.

Terces ("secret" spelled backwards) is a mobile-first web app. It **scans** a photo to show what
it gives away: hidden metadata like location, date and device, plus what the pixels reveal, such
as faces, readable text, licence plates and people. Then it **cloaks** the photo in one tap. It
strips all metadata, covers what you choose with irreversible masks, and hands you a clean copy to
share.

Everything runs on your phone. Your photo is never uploaded.

**Status:** in development, not launched yet.

## How it works

1. **Choose a photo.** No account, no install.
2. **Scan.** The app reads the metadata and runs small detection models on the device. It shows
   what it found: "This photo gives away 7 things."
3. **Cloak.** Every finding is selected by default (people are opt-in). Tap a zone to keep it
   visible, or draw a zone over anything the scan missed. Each kind of zone gets the cover you
   pick: blur, mosaic or solid, plus emoji for faces. Blur is the default.
4. **Share.** The result is re-encoded from pixels, so no metadata survives. The app checks the
   exact output bytes before letting you share or download them.
5. **Share the warning** (optional). A card with the count only, drawn from scratch: your photo is
   never in it.

Terces tells you what it found. It never tells you a photo is "safe": detectors can miss things,
which is why drawing zones by hand is always possible.

## Privacy, and how to check it

- **No upload, no backend for your photo.** All processing happens in the browser, in memory, and
  is released when you start over or close the page.
- **Works in airplane mode.** After the first visit, turn the network off and reload: the whole
  flow still works.
- **Strict Content Security Policy.** The site cannot send requests to any other domain. The
  policy is generated from [`config/headers.ts`](config/headers.ts) into `public/_headers`; you can
  also read it in your browser's developer tools.
- **Open source.** The code is here so the claims can be checked.

### What we count

The only data that ever leaves the device is a bare counter with no identifier, sent to Terces'
own domain:

```
POST /api/hit
Content-Type: text/plain

scan
```

The body is `scan` when a photo is analysed and `cloak` when a verified cloaked photo is produced.
Nothing else is sent: no identifier, no cookie, no device details, and nothing about your photo.
The server keeps only a daily total per event (`day, event, count`, see
[`migrations/`](migrations/)). It stores no IP addresses and no per-visit records. Nothing is sent
when you are offline. The handler is [`functions/api/hit.ts`](functions/api/hit.ts).

## Models and data

All models run on the device with ONNX Runtime Web. Sources, licenses, sizes and SHA-256 checksums
are pinned in [`models/manifest.json`](models/manifest.json); `pnpm models:fetch` refuses any file
that does not match.

| Finds                         | Model                                                  | License    |
| ----------------------------- | ------------------------------------------------------ | ---------- |
| Faces                         | YuNet (OpenCV Zoo, 2023mar)                            | MIT        |
| Text (detection)              | PaddleOCR PP-OCRv5 mobile det                          | Apache-2.0 |
| Text (reading)                | PaddleOCR PP-OCRv5 mobile rec, one reader per alphabet | Apache-2.0 |
| People, vehicles (for plates) | YOLOX-Nano (Megvii)                                    | Apache-2.0 |

Text is read in Latin alphabets, Chinese, Japanese, Korean, Cyrillic, Arabic, Devanagari, Thai,
Greek, Tamil and Telugu. Every detected text is covered whatever its alphabet; reading only gives
each zone its name. The Latin reader ships with the app; the others (about 22 MB) are downloaded
the first time a photo has text and kept for offline use. `pnpm models:fetch` stores their weights
in 8 bits ([`scripts/onnx-int8.ts`](scripts/onnx-int8.ts)), which makes them about 3.6 times
smaller with the same accuracy.

Offline place names ("near Lyon, FR") come from a bundled town list, never from a network lookup:
map outlines from Natural Earth (public domain), town names from GeoNames (CC BY 4.0). See
[`public/geo/SOURCES.md`](public/geo/SOURCES.md).

## Tech

- Vite, React, TypeScript, Tailwind CSS, as a static site on Cloudflare Pages
- ONNX Runtime Web (WebGPU, with a WebAssembly fallback) in a Web Worker
- Metadata reading with exifr; JPEG output checked at the byte level and with exifr
- Offline support with a service worker; models cached on first use
- WebGL2 shaders for the scanner interface, with a static version for reduced motion
- Usage counter: one Pages Function and a Cloudflare D1 table; a private dashboard behind
  Cloudflare Access

## Development

Requires Node 22 and pnpm 10.

```sh
pnpm install
pnpm models:fetch   # download the models and verify their checksums
pnpm dev            # local dev server
pnpm check          # typecheck, lint, unit tests, text lint, build, end-to-end tests
pnpm budget         # compressed download size of a first visit (after pnpm build)
```

End-to-end tests run on WebKit (iPhone 15 profile) and Chromium (Pixel 7 profile) against the
production build, with the production headers.

To try the usage counter locally with the Cloudflare runtime:

```sh
pnpm build
pnpm wrangler d1 migrations apply terces-usage --local
pnpm wrangler pages dev dist
```

## Deploy

Cloudflare Pages, with wrangler logged in (`pnpm wrangler login`).

```sh
pnpm deploy:setup     # once: create the Pages project and the D1 database, fill wrangler.toml
pnpm deploy:preview   # full check, build, migrations, deploy to <branch>.terces.pages.dev
pnpm deploy:prod      # same to production: clean tree on main, typed confirmation
```

`deploy:preview --quick` skips the end-to-end tests. Setup prints the remaining dashboard step:
a Cloudflare Access application for `/admin`. Its team domain and audience tag are stored as Pages
secrets, outside the repo:

```sh
pnpm wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name terces   # myteam.cloudflareaccess.com
pnpm wrangler pages secret put ACCESS_AUD --project-name terces           # the app's AUD tag
```

Add `--env preview` to set them for previews too. Without them the admin page refuses everyone,
and a production deploy stops. For `wrangler pages dev`, put them in `.dev.vars` (not committed).

## License

To be decided.
