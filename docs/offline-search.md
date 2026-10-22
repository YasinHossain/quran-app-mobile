# Offline Search

Search is offline-first. Typing in a search box never needs the network; the full results screen goes online to cover every translation and falls back to offline results.

## Behavior

| Surface | Source | Code |
|---|---|---|
| Search box dropdown / modal (as you type) | Offline only | `hooks/useQuickSearch.ts` → `searchOffline` |
| Full results screen (`/search`) | Online first, offline fallback | `hooks/usePaginatedSearch.ts` → `deepSearch` |

- **Offline scope:** the Arabic text (bundled), Saheeh International (bundled), and every translation the user has downloaded. Tafsir is not indexed.
- **Search all translations:** the dropdown's bottom button opens the full results screen. When offline search finds no verses, that button becomes the primary action.
- **Fallback:** if the first online page fails or exceeds 8 s, the results screen shows offline results with a "Showing offline results" banner and a retry. Later pages never switch source; a failed page shows a retry row instead.
- **Merged ranking:** online page pools include up to 50 offline matches. The offline index ranks the whole Quran, while the API only returns its own top 50, so merging improves the top of the list. A verse found both ways shows the reader's own translation.

## Index

SQLite FTS5 tables in `quran_app.db`, created by migration 8, plus `fts5vocab` views of them (`search_translation_vocab`, `search_arabic_vocab`, migration 9) that ranking reads for word frequencies. FTS5 is compiled into expo-sqlite unless `expo.sqlite.enableFTS` is set to `false`; never set it.

| Table | Rows | rowid | Columns |
|---|---|---|---|
| `search_translation_fts` | one per (translation, verse) | `translationId * 10000 + verseId` | normalized `text`, `translation_id`, `verse_key` |
| `search_arabic_fts` | one per verse (6,236) | `verseId` (1:1 = 1 … 114:6 = 6236) | normalized `imlaei`, Arabic `light` form, `verse_key` |

Sizes on disk: Arabic index about 2.3 MB, plus about 1.6 MB per indexed translation.

**Keeping it current**
- `TranslationOfflineStore` writes translation index rows in the same transaction as `offline_translations` and removes them on delete. Index failures are logged and never fail an install.
- `prepareSearchIndexAsync` (`src/core/infrastructure/search/prepareSearchIndex.ts`) runs after startup and before the first search. It builds the Arabic index once, indexes translations installed before this feature, and reindexes any translation whose row count drifted.
- Versions live in `app_meta`. Bump `SEARCH_INDEX_TEXT_VERSION` in `lib/search/searchText.ts` whenever normalization changes; both indexes rebuild on the next launch.

**Arabic search text:** `src/data/search/quran-imlaei.json`, Quran.com's Imlaei (modern spelling) text. It is used only for matching; results always display Uthmani text from `offline_verses`, or the bundled Saheeh payload if no translation is installed. Regenerate it with `node scripts/generate-search-arabic-text.js` (validates every surah's verse count), then update `IMLAEI_SOURCE_VERSION`.

## Matching and ranking

All code is pure TypeScript under `lib/search/`, tested with `node:sqlite` in `tests/offline-search/`.

- `searchText.ts`: one normalizer for index text, queries, and highlights. It case-folds, strips Latin and Arabic diacritics, unifies Arabic letter variants (alef/hamza forms, ta marbuta, alef maqsura, Persian/Urdu forms), drops standalone numbers (translation footnote markers), and splits Han/Kana into single-character tokens.
- Query tokens of three or more characters match as prefixes (`prophet` finds `prophets`). In Latin script, an English inflection (`-s`, `-ed`, `-ing`, `-ers`, …) counts almost as the word itself, while other extensions (`light` → `lighten`) count much less. Every word must match first; if fewer than 20 verses match, partial matches are added.
- **Synonyms** (`lib/search/searchSynonyms.ts`): curated groups of names and Islamic terms that translations spell or translate differently (`musa` / `moses`, `salah` / `prayer`, `disbelievers` / `unbelievers`). Every word in a group finds the others, at slightly lower strength than the typed word, and is highlighted. Expansion happens at query time, so the list can change without a reindex. Only group words that name the same person, place, or term (Iblis is not grouped with Satan), and keep each entry a single normalized word.
- The Arabic **light form** strips a leading article or conjunction and removes alefs, so Uthmani and Imlaei spellings (`العلمين` / `العالمين`) and clitic forms (`والرحمة`) meet. It is a low-weight column and match strength.
- `searchRanking.ts`: one scorer for offline and online results. It combines retrieval order (bm25 offline, API order online), word coverage weighted by each word's rarity in the offline index (bm25 IDF, so `light` outweighs `upon`), exact and partial phrase runs, proximity, match position, and verse brevity, plus a small bonus for the reader's selected translations.
- Surah names match offline by transliteration, including vowel-insensitive variants (`yaseen` → Ya-Sin), English meaning (`cow`), or Arabic (`الكهف`).

**Known limits:** synonyms are single words in English and transliteration only; words written with an apostrophe are split (`Qur'an` is indexed as `qur an`, so `quran` does not find it); Thai and Khmer text without spaces only matches at word-run starts; Arabic root search is not offered.

The ranking test list in `tests/offline-search/offline-search.test.cts` (for example "light upon light" → 24:35, `قل هو الله احد` → 112:1) guards relevance. Run `npm run test:offline-search` after any normalization or scoring change.
