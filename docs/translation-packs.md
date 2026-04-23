# Translation Packs

This app now supports a proper hosted-pack path for translations.

Instead of downloading one translation by making 114+ live API calls from the phone, you can:

1. Generate a translation pack once on your machine.
2. Upload the generated files to any static host/CDN.
3. Point the app at the hosted `catalog.json`.
4. Let the app download one hosted pack file and import it into SQLite.

## What gets hosted

The generator writes a folder like this:

```text
dist/translation-packs/
  catalog.json
  translations/
    20/
      2026-04-23/
        manifest.json
        payload.json
```

Files:

- `catalog.json`
  The app reads this first. It lists which translation packs exist, their versions, checksums, and sizes.
- `manifest.json`
  Metadata for one pack.
- `payload.json`
  The actual translation pack content for one translation.

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

When a user taps download:

1. The app checks `expo.extra.translationPackCatalogUrl`.
2. If a hosted pack exists for that `translationId`, the app downloads:
   - `manifest.json`
   - `payload.json`
3. The app verifies checksum/size.
4. The app imports the verses into the existing SQLite offline tables.
5. If no hosted pack is configured or found, the app falls back to the old quran.com API loop.

That means you can ship the new pipeline safely without breaking current downloads.

## Configure the app

Set the catalog URL in `app.json`:

```json
{
  "expo": {
    "extra": {
      "translationPackCatalogUrl": "https://your-cdn.example.com/translation-packs/catalog.json"
    }
  }
}
```

## Generate packs

Run:

```bash
npm run generate:translation-packs -- --translations=20,131 --version=2026-04-23
```

Optional:

- `--output=dist/translation-packs`
- `--base-url=https://your-cdn.example.com/translation-packs/`

If `--base-url` is provided, the generated catalog uses absolute URLs. Otherwise it uses relative URLs, which is usually the simplest option when you upload the whole folder as-is.

## Why this is the right foundation

- Translations become one hosted asset per translation, not a long in-app API loop.
- Tafsir can reuse the same pattern later: catalog -> manifest -> payload -> SQLite import.
- Audio can reuse the same catalog/manifest idea while keeping files on disk.
- Mushaf packs already follow this shape, so the app is moving toward one pack model instead of separate ad-hoc download paths.
