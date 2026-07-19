# Word Verb Reference Pack

Phase 11B adds six principal parts for the exact verb form encountered in the Quran. It does not browse or display every derived form belonging to the root.

## Displayed fields

- perfect (`الماضي`);
- imperfect (`المضارع`);
- imperative (`الأمر`);
- active participle (`اسم الفاعل`);
- passive participle (`اسم المفعول`);
- verbal noun / maṣdar (`المصدر`).

The selected Word Study analysis supplies the normalized root, lemma when available, and Quranic verb form. The repository queries only that root and form. An exact normalized perfect/lemma match wins. A sole remaining row is safe to use; conflicting candidates return `ambiguous-reference` and are not guessed.

## Pack and compiler

The immutable bundled pack uses `quran-verb-reference-sqlite-v1`, schema 1. Rebuild it from a SQLite source containing a `verbs` table with `Root`, `Type`, `Past`, `Present`, `Order`, `Subject`, `Object`, and `Masdar` columns:

```sh
VERB_REFERENCE_SOURCE=/absolute/path/to/source.db npm run compile:verb-reference-pack
```

The compiler trims source whitespace, preserves Arabic field text, maps source pattern codes to Quranic Roman-numeral forms, removes exact duplicate rows, creates root/form and lemma lookup indexes, and records database/logical/source SHA-256 checksums in the manifest.

## Release boundary

The current implementation follows the product owner's instruction to build before permission is finalized. The manifest deliberately records `Permission pending`; the pack must not be publicly distributed until the exact artifact has documented redistribution permission and its records have qualified Quranic Arabic review. Replacing the source later requires recompiling the pack, not changing the domain, repository, or UI.
