# Terces

> This is a public service announcement.
> See what your photo gives away. Then cloak it.

Terces ("secret" spelled backwards) is a mobile-first web app. It **scans** a photo to show what
it gives away: hidden metadata like location, date and device, plus what the pixels reveal, such
as faces, readable text, licence plates and people. Then it **cloaks** the photo in one tap. It
strips all metadata, covers what you choose with irreversible masks, and hands you a clean copy to
share.

Everything runs on your phone. Your photo is never uploaded.

**Status:** in development. The app is not built yet.

## How it works

1. **Choose a photo.** No account, no install.
2. **Scan.** The app reads the metadata and runs small detection models on the device. It shows
   what it found: "This photo gives away 7 things."
3. **Cloak.** Every finding is selected by default. Tap a zone to keep it visible, or draw a zone
   over anything the scan missed.
4. **Share.** The result is re-encoded from pixels, so no metadata survives. The app checks the
   output before letting you share it.

Terces tells you what it found. It never tells you a photo is "safe": detectors can miss things,
which is why drawing zones by hand is always possible.

## Privacy, and how to check it

- **No upload, no backend for your photo.** All processing happens in the browser, in memory, and
  is released when you start over or close the page.
- **Works in airplane mode.** After the first visit, turn the network off: the whole flow still
  works.
- **Strict Content Security Policy.** The site cannot send requests to any other domain. You can
  read the policy in [`public/_headers`](public/_headers) once the app is built, or in your
  browser's developer tools.
- **Open source.** The code is here so the claims can be checked.

### What we count

The only data that ever leaves the device is an anonymous counter, sent to Terces' own domain:

```
POST /api/hit
Content-Type: text/plain

scan
```

The body is `scan` when a photo is analysed and `cloak` when a cloaked photo is produced.
Nothing else is sent: no identifier, no cookie, no device details, and nothing about your photo.
The server keeps only a daily total per event (`day, event, count`). It stores no IP addresses
and no per-visit records. Nothing is sent when you are offline.

## Tech

- Vite, React, TypeScript, Tailwind CSS, as a static site on Cloudflare Pages
- On-device inference with ONNX Runtime Web (WebGPU, with a WebAssembly fallback) in a Web Worker
- Models, all under permissive licenses: YuNet for faces, PaddleOCR PP-OCRv5 for text, YOLOX-Nano
  for people and vehicles
- Metadata reading with exifr
- WebGL2 shaders for the scanner interface, with a static version for reduced motion
- Usage counter: one Pages Function and a Cloudflare D1 table

Model sources, licenses and checksums will be listed in `models/manifest.json`.

## Development

Coming with the first build phase. The planned commands are:

```sh
pnpm install
pnpm models:fetch   # download the models and verify their checksums
pnpm dev            # local dev server with production headers
pnpm check          # typecheck, unit tests, copy lint, build, end-to-end tests
```

## License

To be decided.
