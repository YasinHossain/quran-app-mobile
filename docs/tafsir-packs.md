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

## Payload format (`tafsir-json-v2`)

```json
{
  "tafsirId": 169,
  "version": "2026-10-21",
  "format": "tafsir-json-v2",
  "verses": [{ "verseKey": "2:8", "html": "<p>…</p>" }, { "verseKey": "2:9", "html": "" }],
  "passages": [{ "startVerseKey": "2:8", "endVerseKey": "2:9" }]
}
```

Many tafsirs explain several verses as one passage. A passage is consecutive verses of one
surah; its HTML is on `startVerseKey` and every other verse in the range has empty HTML. The app
stores the range in `offline_tafsir.passage_start` / `passage_end`, shows the passage text on
every verse in it with a "Tafsir for verses 2:8–9" label, and rejects a pack whose passages
overlap, cross a surah, or keep HTML anywhere but the first verse. A verse with empty HTML and
no passage has no commentary in that tafsir; the reader says so in neutral copy, not as an error.

How the generator finds passages: the `by_chapter` endpoint leaves passage verses blank, so for
blank verses (and verses with text right after one) it asks `by_ayah`, whose `verses` map lists
the passage. It keeps a group only when exactly one of its verses has text, drops verses the API
joins from another surah, and rebuilds passages longer than the API's 10-verse list from every
verse that returns that list. Quran.com data quirks found while building this:

- Fathul Majid (381) keeps passage text on the last verse, and `by_ayah` returns no text for it.
  The text header ("৩-৫ নং আয়াতের তাফসীর") confirms the range.
- Al-Sa'di Russian (170) also keeps text on the last verse, but `by_ayah` groups each blank verse
  with the previous verse, which pairs commentary with the wrong verses (2:19 is explained on
  2:20, 2:38 on 2:39). The generator ignores the API groups for tafsirs listed in
  `TRAILING_TEXT_PASSAGE_TAFSIR_IDS` and joins blank verses to the next verse with text.

Review the generator's "Rejected passage" and cross-surah counts when adding a tafsir.

## Why this is the right foundation

- Tafsir becomes one hosted asset per tafsir, not a long in-app request loop.
- The reader still reads from the same `offline_tafsir` table, so the UI path stays unchanged.
- Translation, tafsir, and mushaf now all share the same catalog -> manifest -> payload -> local import pattern.
