# Word Study Dictionary Packs

Phase 11A adds optional English dictionary definitions to the existing Word Study route. No dictionary is bundled with the application.

## Generated packs

| Pack | Source version | Entries | Matched Quran roots | Matched Quran lemmas | Database size |
|---|---:|---:|---:|---:|---:|
| `lane-en` | 3.1.3 | 29,778 | 1,444 | 2,596 | 29,671,424 bytes |
| `hans-wehr-en` | 2.14.01 | 13,980 | 1,354 | 2,347 | 4,861,952 bytes |

Each pack is a Quran-focused subset. It contains complete source families for matched Quran roots plus exact Quran lemma/headword matches. The compiler records unmatched roots and lemmas in each validation report; absence is never treated as a definition.

## Rebuild

Place the pinned databases at:

- `.artifacts/word-reference/lanelexicon-v3.1.3.sqlite`
- `.artifacts/word-reference/hanswehr-v2.14.01.sqlite`

Then run:

```bash
npm run compile:word-reference-packs
npm run test:word-study-pack
```

The compiler reads the installed Core Word Study database as the authoritative Quran root/lemma vocabulary, sanitizes Lane's limited emphasis markup, preserves Hans Wehr text as plain text, and emits deterministic SQLite databases, manifests, validation reports, and `dist/word-reference-packs/catalog.json`.

## Runtime

- The Dictionary tab loads only when selected.
- Lane and Hans Wehr install, update, roll back, and delete independently.
- Downloads use staging directories, SHA-256/size checks, SQLite application/schema/integrity checks, and atomic registry promotion.
- Lookup prioritizes exact normalized lemma headwords, then root articles and the complete root family.
- Definitions load only when their headword card is expanded.
- The app labels source/version on every result and does not claim that a root-family match is the exact contextual sense.

Phase 11B verb principal parts remain deferred until a structured reviewed source is supplied.
