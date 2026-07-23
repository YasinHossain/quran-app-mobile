# Verse Spotlight Offline Data

Phase 1 keeps all Verse Spotlight behavior offline and does not change the Home UI.

## Generated assets

Run:

```bash
npm run generate:verse-spotlight
```

The generator validates and writes:

- `assets/verse-spotlight/canonical-verse-index.json`
  - Canonical order for all 6,236 verse keys.
  - Surah IDs, English/Arabic display names, translated names, verse counts, and canonical offsets.
  - Generated from `src/data/chapters.en.json` and checked against the bundled translation payload.
- `assets/verse-spotlight/curated-anchor-pool.json`
  - Versioned explicit list of 525 reviewed random anchors.
  - Generated only from the checked-in source list at
    `scripts/verse-spotlight/reviewed-pool.json`.
- `assets/verse-spotlight/bundled-sahih-metadata.json`
  - Saheeh International translation ID, translator, source/version, SHA-256 and source-manifest checksums, verse count, and rights status.
  - Points to the existing bundled payload at
    `dist/translation-packs/translations/20/2026-04-23/payload.json`; the app does not bundle a duplicate.
- `assets/verse-spotlight/validation-report.json`
  - Counts, uniqueness, boundary validation, fallback alignment, and asset checksums.

Generation fails for missing or duplicate verse keys, invalid canonical order, bad surah boundaries, an unexpected source checksum, an unknown curated key, or fallback coverage other than exactly 6,236 verses.

## Curated pool workflow

The initial pool uses the Saheeh International text as an editorial aid. A conservative 6–45 word filter removes obvious fragments, unmatched narrative quotations, context-sensitive legal/war passages, and several high-risk grammatical openings. The resulting membership is stored as an explicit key list; normal generation only validates that list and never silently changes it.

To intentionally rebuild the initial candidate selection:

```bash
node scripts/verse-spotlight/generate-assets.cjs --seed-reviewed-pool
```

That command overwrites the reviewed source list and therefore requires a fresh editorial review before release. Routine builds must use `npm run generate:verse-spotlight` without the seed flag.

## Runtime contract

- Previous and next clamp at `1:1` and `114:6`; they do not wrap.
- Shuffle selects only from the curated pool and avoids an immediate repeat when alternatives exist.
- Stored state uses schema version 1 and distinct Home/widget keys.
- Missing, corrupt, obsolete, or invalid state recovers to a valid curated anchor.
- The selected translation is eligible only when its download-index state is exactly `installed`, has no recorded error, and contains a non-empty exact verse row.
- Any missing, partial, failed, or corrupt selected source resolves wholly to bundled Saheeh International. The resolver never makes a network request.

The upstream translation-pack manifest does not declare a standalone translation license. The metadata therefore records the Quran Foundation developer terms as governing source rights and flags that distribution must remain within those terms.
