# Tafsir Packs

This app now supports the same hosted-pack path for tafsir that translations already use.

Instead of downloading one tafsir by making 114 live API calls from the phone, you can:

1. Generate a tafsir pack once on your machine.
2. Upload the generated files to any static host/CDN.
3. Point the app at the hosted `catalog.json`.
4. Let the app download one hosted pack file and import it into SQLite.

## What gets hosted

The generator writes a folder like this:

```text
dist/tafsir-packs/
  catalog.json
  tafsirs/
    169/
      2026-04-23/
        manifest.json
        payload.json
```

Files:

- `catalog.json`
  The app reads this first. It lists which tafsir packs exist, their versions, checksums, and sizes.
- `manifest.json`
  Metadata for one pack.
- `payload.json`
  The actual tafsir pack content for one tafsir.

## Where the file downloads from

From any static URL you control. Common choices:

- Cloudflare R2 + public bucket/CDN
- AWS S3 + CloudFront
- Vercel static hosting
- GitHub Releases or GitHub Pages

The app only needs one absolute URL:

- `catalog.json`

Every pack file can then be resolved relative to that catalog URL.

## App flow

When a user taps download in the Tafsir panel:

1. The app checks `expo.extra.tafsirPackCatalogUrl`.
2. If a hosted pack exists for that `tafsirId`, the app downloads:
   - `manifest.json`
   - `payload.json`
3. The app verifies checksum and size.
4. The app imports the tafsir HTML into the existing SQLite `offline_tafsir` table.
5. If no hosted pack is configured or found, the app falls back to the optimized `by_chapter` API loop.

That means you can ship the new pipeline safely without breaking tafsir downloads.

## Configure the app

Set the catalog URL in `app.json`:

```json
{
  "expo": {
    "extra": {
      "tafsirPackCatalogUrl": "https://your-cdn.example.com/tafsir-packs/catalog.json"
    }
  }
}
```

## Generate packs

Run:

```bash
npm run generate:tafsir-packs -- --tafsirs=169 --version=2026-04-23
```

Optional:

- `--output=dist/tafsir-packs`
- `--base-url=https://your-cdn.example.com/tafsir-packs/`

If `--base-url` is provided, the generated catalog uses absolute URLs. Otherwise it uses relative URLs, which is usually the simplest option when you upload the whole folder as-is.

## Why this is the right foundation

- Tafsir becomes one hosted asset per tafsir, not a long in-app request loop.
- The reader still reads from the same `offline_tafsir` table, so the UI path stays unchanged.
- Translation, tafsir, and mushaf now all share the same catalog -> manifest -> payload -> local import pattern.
