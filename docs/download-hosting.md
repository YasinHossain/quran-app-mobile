# Download Hosting and Migration

Last audited: 2026-10-13

## Release status

The versioned data-pack bundle is complete and internally verified for migration to an object-storage or standard HTTP host. It is not suitable for GitHub Pages: the referenced assets total 1,304.2 MiB before repository history and Pages files, while the current `gh-pages` tree is already 591.9 MiB.

- Chapter recitation metadata and files come from Quran Foundation's QDC API/CDN, and word-pronunciation clips come from `audio.qurancdn.com`. Audio is intentionally outside the data-pack bundle.
- The optional Arabic grammar pack is published on the production host.
- The verb-reference pack (`quran-verbs` 1.1) is published on the production host; only its catalog is tracked in the repository.

Every hosted source must be credited in the in-app Credits & Sources screen (`src/data/credits.ts`) and in its pack manifest.

## Audited pack inventory

Run `npm run audit:download-packs` to repeat the checksum, size, row-count, catalog-completeness, and Mushaf-font checks.

| Category | Required packs | Referenced data |
| --- | ---: | ---: |
| Translations | 126 | 396.4 MiB |
| Word-by-word languages | 8 | 108.6 MiB |
| Tafsirs | 20 | 264.5 MiB |
| Mushaf editions | 6 | 460.2 MiB |
| Word Study Essentials | 1 | 26.3 MiB |
| Word grammar development pack | 1 | 15.1 MiB |
| Dictionary packs | 2 | 32.9 MiB |
| Total | 164 | 1,304.2 MiB |

The six current Mushaf entries include the Tajweed `v4-ttf` pack and all 604 required fonts. The obsolete fontless Tajweed `v4` entry is excluded from the migration catalog. Application interface languages are bundled source data, not separate downloads.

## Production host

Approved packs are served from Cloudflare R2:

| Setting | Value |
| --- | --- |
| Cloudflare account | `49e61b4ff7bb2e9a18ed5993777da4a6` |
| Bucket | `quran-packs` |
| Public URL | `https://cdn.appquran.com/<category>/...` (R2 custom domain on the `appquran.com` zone; the `r2.dev` URL stays disabled) |
| Uploads | `npm run upload:download-packs` via the `r2` rclone remote |

The cache rule `Cache CDN packs` (Hostname equals `cdn.appquran.com`, eligible for cache, edge TTL from `Cache-Control`) keeps repeat downloads off R2's billable reads. Its browser TTL must respect the origin header: Cloudflare's default 4-hour browser TTL otherwise rewrites the catalogs' `max-age=300`, and devices keep a stale catalog for up to 4 hours.

The bucket mirrors `dist/` paths, so each catalog lives at `https://cdn.appquran.com/<category>/catalog.json` and its relative asset URLs resolve below it. All eight catalog URLs, including grammar and verb reference, use this host.

`cdn.appquran.com` is baked into every shipped build. Keep the `appquran.com` domain renewed after any rebrand; a future domain can be attached to the same bucket alongside it.

### Upload setup

1. Install rclone (`brew install rclone`).
2. Create an R2 API token with **Object Read & Write** scoped to `quran-packs` (Cloudflare dashboard → R2 → Manage API Tokens).
3. Add an `r2` remote to `~/.config/rclone/rclone.conf` (never commit it):

   ```ini
   [r2]
   type = s3
   provider = Cloudflare
   endpoint = https://49e61b4ff7bb2e9a18ed5993777da4a6.r2.cloudflarestorage.com
   acl = private
   no_check_bucket = true
   access_key_id = <token Access Key ID>
   secret_access_key = <token Secret Access Key>
   ```

`npm run upload:download-packs -- --dry-run` lists what would change. The script uploads only catalog-referenced files, sends versioned assets with `Cache-Control: public, max-age=31536000, immutable` first, then the catalogs with `max-age=300`, so a live catalog never references a missing file. Never overwrite an existing versioned path with different bytes; publish a new version directory instead.

## Migration procedure

1. Run `npm run normalize:download-pack-urls`. Catalog asset locations must remain relative so one catalog base URL controls each category.
2. Run `npm run audit:download-packs`; do not upload if it reports any error.
3. Run `npm run upload:download-packs`. It uploads every catalog-referenced category without changing internal paths or bytes.
4. Serve JSON, SQLite, font, and audio assets with correct `Content-Length`, MIME types, HTTPS, CORS for the intended clients, byte-range support for large files, and immutable caching on versioned paths. Keep catalog responses short-lived or explicitly invalidatable.
5. Keep the catalog URLs in `app.json` on `https://cdn.appquran.com/<category>/catalog.json`. The relative asset URLs inside each catalog resolve against the catalog URL.
6. From a clean production-signed build, test install, cancel, retry, update, rollback, corruption handling, deletion, and offline use for every category. Include a five-simultaneous-download stress test on physical Android devices and, when applicable, iOS devices.
7. Repeat `npm run verify` and `npm run audit:download-packs` immediately before the release artifact is signed.

The runtime no longer falls back to live API downloads when a translation, tafsir, or Mushaf pack is absent from its configured host. A missing hosted asset now fails clearly. Remote native file transfers share a process-wide limit of five, while SQLite imports are serialized to avoid concurrent native write collisions.
