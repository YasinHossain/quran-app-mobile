# Mushaf Packs

Mushaf downloads use the same hosted-pack shape as translations and tafsir.

Instead of building an exact mushaf pack on the phone by calling Quran.com for every page, generate the pack once and publish it to a static host such as GitHub Pages.

## What Gets Hosted

```text
dist/mushaf-packs/
  catalog.json
  mushafs/
    qpc-uthmani-hafs/
      v1/
        manifest.json
        payload.json
        fonts/
          UthmanicHafs1Ver18.ttf
```

The hosted payload contains the generated page data for the whole mushaf. The app reads `catalog.json`, downloads the listed files, verifies checksum/size when present, then splits `payload.json` into local page-addressable files during install.

That keeps phones from calling the live Quran.com page API for hosted packs and avoids hundreds of tiny remote page downloads for Unicode/QPC/IndoPak packs.

## Configure The App

`app.json` points at GitHub Pages by default:

```json
{
  "expo": {
    "extra": {
      "mushafPackCatalogUrl": "https://yasinhossain.github.io/quran-app-mobile/mushaf-packs/catalog.json"
    }
  }
}
```

When you move to another storage provider later, only this catalog URL needs to change.

## Generate Packs

```bash
npm run generate:mushaf-packs -- --packs=all --base-url=https://yasinhossain.github.io/quran-app-mobile/mushaf-packs/
```

Optional:

- `--output=dist/mushaf-packs`
- `--base-url=https://yasinhossain.github.io/quran-app-mobile/mushaf-packs/`
- `--packs=qpc-uthmani-hafs` to generate only one pack during development.

If `--base-url` is omitted, the catalog uses relative URLs. That is easiest when uploading the whole `dist/mushaf-packs` folder as-is.

## App Flow

When a user installs a mushaf pack:

1. The app checks `expo.extra.mushafPackCatalogUrl`.
2. If a matching hosted pack exists, it installs from the hosted files.
3. If the catalog is missing, unavailable, or does not include that pack, the app falls back to the live Quran.com installer.

This keeps development fast now while preserving the ability to move the hosted assets to R2, S3, or another CDN later.
