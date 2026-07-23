# Word Study Pack Compiler

Phase 2 builds a read-only SQLite study pack outside the React Native app. It never reads GreenTech assets, calls a live API, or scrapes a website.

## Inputs

1. Download the approved original `quranic-corpus-morphology-0.4.txt` artifact and place it at `.artifacts/word-study/quranic-corpus-morphology-0.4.txt`, or set `WORD_STUDY_MORPHOLOGY_SOURCE` to its path.
2. Keep the canonical offline English word payload at `dist/word-translation-packs/languages/en/2026-07-04/payload.json`.
3. Verify that the checksums and attribution in `scripts/word-study-pack/qac-v0.4.sources.json` match the approved artifacts. The compiler rejects any mismatch.

The expected SHA-256 values are:

- QAC morphology v0.4: `a1d12923815341face765083805d2148ed2d9f5cc3f7d6665219d887675d8c46`
- Canonical offline word payload: `38975bff99637665869e8231d1d5824b1bc4db4c6cd3b6358b8231d4e882b6f3`

## Commands

```sh
npm run compile:word-study-pack
npm run test:word-study-pack
```

Optional compiler arguments use `--name=value` syntax: `--morphology`, `--canonical`, `--sources`, `--output`, and `--sqlite`. Set `WORD_STUDY_SQLITE3` when `sqlite3` is not on `PATH`.

## Determinism and validation

Rows and IDs are sorted canonically, source checksums are fixed inputs, no timestamps are written, SQLite uses fixed page/schema settings, and the final database is vacuumed. The test suite requires two builds using identical inputs to be byte-identical. The manifest also records a logical SHA-256 over sorted compiler data so content can be compared across SQLite versions.

Schema 2 is the compact Essentials layout. It stores numeric word IDs and Quran coordinates, normalizes source provenance into three pack-level roles, and retains the surface/lemma/root occurrence indexes. This preserves the complete user-facing feature set while avoiding repeated location and source strings on every word and morpheme row.

The compiler requires 6,236 ayahs and 77,429 word locations. It compares every `${surah}:${ayah}:${wordPosition}` key, checks normalized surface alignment, derives lemma/root counts from aligned rows, checks foreign keys and database integrity, and writes:

- `quran-word-study.db`
- `manifest.json`
- `validation-report.json`
- `validation-report.md`

Surface script differences are recorded with their disposition. Missing/extra word locations, count mismatches, duplicates, checksum mismatches, and referential-integrity failures stop the build.
