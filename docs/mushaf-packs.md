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

### Page-font bundles

QCF packs need one font per page (604 files). Their `fonts/` directory is also published as `assets.bin`: the manifest's `assetFiles` concatenated in manifest order, with no header. The catalog entry advertises it as `assetBundle: { url, checksum, sizeBytes }` (MD5). Builds that understand it download the bundle with one request, verify it with a streaming digest, and split it into the font files by each entry's `sizeBytes`; any bundle failure falls back to per-file downloads. Older builds ignore the field and keep using the individual fonts, so both must stay published.

Measured on a Galaxy Z Flip 7 (2026-10-22), QCF Madani V2 (120 MB) installed in about 10 s with the bundle, against 57 s (cached) to 110 s (uncached) with 604 separate font requests.

The bundle adds no new pack version: installed files are byte-identical either way. `npm run audit:download-packs` checks every bundle slice against the manifest checksums.

## Configure The App

`app.json` points at the Cloudflare R2 host (see `docs/download-hosting.md`):

```json
{
  "expo": {
    "extra": {
      "mushafPackCatalogUrl": "https://cdn.appquran.com/mushaf-packs/catalog.json"
    }
  }
}
```

When you move to another storage provider later, only this catalog URL needs to change.

## Generate Packs

```bash
npm run generate:mushaf-packs -- --packs=all
```

Optional:

- `--output=dist/mushaf-packs`
- `--base-url=<absolute URL>` to write absolute asset URLs instead (not used for the R2 host).
- `--packs=qpc-uthmani-hafs` to generate only one pack during development.
- `--bundle-existing` to add `assets.bin` bundles and catalog `assetBundle` entries to packs already in the output directory, without refetching source data.

If `--base-url` is omitted, the catalog uses relative URLs, which `npm run upload:download-packs` expects.

## Page Data Source

Page and line numbers come from Quran.com's own endpoint, `https://api.qurancdn.com/api/qdc/verses/by_page/{page}?mushaf={id}`, which lays each page out for the requested mushaf: 1 = QCF V2, 2 = QCF V1, 5 = QPC Hafs, 6 = IndoPak 15-line (610 pages), 7 = IndoPak 16-line (548 pages), 19 = Tajweed V4.

Do not use the public `api.quran.com/api/v4` page endpoint. It ignores `mushaf`, groups verses by V1 pages, and switches `line_number` to the V2 layout whenever `code_v2` is requested. Packs built from it put V1 glyphs on V2 lines and placed 361 words on a neighbouring page. The generator now refuses any page whose words carry another page or an out-of-range line number.

The generator also records each pack's full download size (page data plus fonts) in `src/data/mushafPackDownloadSizes.json`, which the download dialog shows.

The IndoPak prints have no fixed list of centred lines. The reader centres a line that ends a Surah when, at normal word spacing, it would fill less than 85% of the line. A fuller Surah-ending line stays justified like its neighbours.

IndoPak packs render `text_indopak_nastaleeq`, the encoding the bundled IndoPak Nastaleeq font is built for. `text_indopak` carries zero-width characters that font lacks.

## Page Numbers

Page numbers belong to the selected mushaf. The Madani prints (V1, V2, QPC Hafs, Tajweed) share 604 pages. IndoPak 15-line has 610 pages and IndoPak 16-line has 548, and the 16-line print often continues a verse onto the next page. `lib/mushaf/mushafPageLayout.ts` answers page counts, page verse ranges, verse → page, and Surah and Juz page ranges for Home, the Page, Surah and Juz readers, and search. It reads `src/data/quranPageVerseRanges.ts` for Madani pages and `src/data/indopak{15,16}PageVerseRanges.ts` for IndoPak pages. The generator rewrites the IndoPak tables from the same page data as the packs, so regenerate both together. The reading planner still estimates progress with Madani pages.

When regenerated data changes a published pack, give it a new version (for example `v1-r2`) in the generator, `src/core/infrastructure/mushaf/downloadablePacks.ts` and `data/mushaf/options.ts`. Installed copies of the old version keep working until the user installs the new one, which then replaces it on disk. Keep the old version in the hosted catalog until no released build requests it.

## App Flow

When a user installs a mushaf pack:

1. The app checks `expo.extra.mushafPackCatalogUrl`.
2. If a matching hosted pack exists, it installs from the hosted files.
3. If the catalog is missing, unavailable, or does not include that pack, the app falls back to the live Quran.com installer.

This keeps development fast now while preserving the ability to move the hosted assets to R2, S3, or another CDN later.
