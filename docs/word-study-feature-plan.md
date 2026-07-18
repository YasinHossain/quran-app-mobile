# Quran Word Study: Product, Data, and Implementation Plan

Status: planning only. No feature implementation is included in this document.

## 1. Executive decision

Build the word-study experience in **React Native**, while keeping word rendering and hit-testing inside each reader's existing native surface.

- Android Kotlin should render the reader, identify the tapped word, and emit a small event.
- Existing Mushaf native/WebView readers should emit the same word location contract.
- React Native should own the quick word sheet, full study route, local data queries, navigation, accessibility, theming, audio actions, bookmarks, and future learning tools.
- A future Swift reader should implement only the same render/tap event contract. It should not reimplement the study UI or database logic.
- Morphology and occurrence data should be offline-first in a versioned SQLite study pack. Network services should supply updates, optional language content, and audio—not the primary tap response.

This split preserves the Android reader's scrolling performance without creating separate Android and iOS product implementations. A word-details screen is mostly static text, tabs, and indexed database queries; implementing it in Kotlin would provide negligible performance benefit and create permanent platform duplication.

## 2. What Greentech implements

The study used Greentech Al Quran app version 1.35.7 in the Android emulator, its accessible UI hierarchy, its public documentation and issue tracker, and the database assets distributed in its APK. Control flow was not decompiled, and its data must not be copied into this app without explicit rights and provenance.

### 2.1 Interaction model

Greentech uses two levels of disclosure.

1. Tapping a word opens a quick bottom sheet containing:
   - `surah:ayah:word` address;
   - a color-coded segmentation legend;
   - the Arabic word divided into morphological segments;
   - contextual English gloss;
   - lemma/derived form;
   - root when one exists;
   - word audio;
   - share and a generic `Click for More` action.
2. `Click for More` opens a full word screen containing:
   - a horizontally scrollable ayah word ribbon with the selected word highlighted;
   - the same word summary card;
   - extra verb-form cards when the word is a verb;
   - Occurrence, Meaning, Morphology, and Grammar tabs.

The occurrence experience distinguishes a root family from a lemma. For `وَأَنزَلَ` at `3:3:9`, it reports root `نزل` 293 times across 12 derived forms, then lets the user expand lemma `أَنزَلَ` (183 occurrences) into individual Quran locations and glosses.

Verb words additionally show the verb form and six principal forms: perfect, imperfect, imperative, active participle, passive participle, and verbal noun.

### 2.2 Local data model observed in the distributed app

The APK bundles its study data instead of depending on a live request for each word:

- `assets/databases/corpus.db`: 72,684,544 bytes uncompressed, about 9.7 MB compressed in the APK;
- `assets/databases/words.db`: 6,617,088 bytes uncompressed, about 2.6 MB compressed;
- `corpus.db` contains 77,429 word rows, 1,652 distinct non-empty roots, 4,771 distinct non-empty lemmas, and 2,084 verb-form rows;
- all 77,429 corpus rows contain morphology, Arabic i'rab, and word-meaning text;
- its word key is `(surah, ayah, word)`;
- a word row supports up to five segments with per-segment POS and morphology descriptions, plus root, lemma, verb type, sarf, i'rab, and meaning;
- the separate verb table holds root, type, perfect, imperfect, imperative, active participle, passive participle, and verbal noun.

The inspected bundled Mushaf in this repository also contains exactly **77,429 unique non-end word locations**. The location `3:3:9` maps to `وَأَنزَلَ` in both. This makes `surah:ayah:position` the correct cross-source identifier. Quran Foundation numeric word IDs must not be treated as the durable key.

### 2.2.1 Provenance findings: GreenTech assembled several content layers

GreenTech's word-study library is not wholly an original GreenTech-authored corpus. The evidence supports a layered lineage:

- GreenTech's public Quran Corpus wiki and issue tracker identify corpus.quran.com as a source/reference. Its local schema and token count also align closely with Quranic Arabic Corpus concepts: up to five segments, POS, morphology features, root, lemma, verb form, and the `surah:ayah:word` key.
- GreenTech issues explicitly compare and correct its local `corpus` records against Quranic Arabic Corpus, and describe English word-by-word content as coming from the word-by-word corpus.
- For the inspected word `3:3:9 وَأَنزَلَ`, GreenTech's full Arabic word-level i'rab text exactly matches Tafsir Center's Surahpedia project **I'rab of the Quran at word level**. Surahpedia identifies that project as prepared by the scientific team at Tafsir Center for Quranic Studies.
- The same inspected word's detailed sarf text exactly matches Surahpedia's **Morphology of Quran Words** project.
- Its short Arabic meaning, `الإنزال: الجلب من علو عن طريق الوحي`, also appears in the external *Meanings of the Words of the Quran, Word by Word* resource. That site credits Bashir Ahmad Sulayman Yunus and lists its underlying references.
- GreenTech separately offers a downloadable verse-level E3rab by Qasim Hamidan Da's as a tafsir resource. That should not be confused with the word-level i'rab field in the tapped-word database.
- A historical GreenTech issue proposed importing e3rab/sarf databases from the MIT-licensed Golden Quran resource repository. However, the tested current GreenTech texts do not match Golden Quran's corresponding `QuranAdditions.db` record, so a closed proposal is not proof that Golden Quran is the shipped source.

The defensible conclusion is: **GreenTech built and maintains the app, integration, indexes, occurrence experience, and compiled offline database, but much of the linguistic content is sourced or derived from external corpora/reference works.** GreenTech may hold permissions that are private or partnership-based; those permissions do not pass to this project. Exact field-by-field provenance is not published in sufficient detail to reuse its APK database.

### 2.3 What to copy conceptually—and what to improve

Keep:

- instant offline response;
- quick sheet followed by an optional deep screen;
- visible segment/POS explanation;
- clear lemma and root navigation;
- occurrence lists with contextual glosses;
- verb-specific information.

Improve:

- replace `Click for More` with the descriptive `Open full word study`;
- explicitly separate **surface**, **lemma**, and **root** counts;
- separate contextual meaning, dictionary meaning, morphology, and sentence grammar instead of mixing them;
- provide beginner-friendly explanations beside technical Arabic grammar terms;
- do not rely on color alone for POS;
- do not make users infer why a field is absent for particles or proper nouns;
- keep the selected word and study state when navigating to an occurrence and back;
- distinguish source/editorial confidence, especially for full i'rab and dictionary definitions.

## 3. Fit with the current app

The repository already has the correct high-level boundary:

- React Native owns data loading, SQLite, settings, routes, audio, and action sheets.
- Kotlin owns the Android translation reader's `RecyclerView` and word layout.
- `NativeSurahReader` already emits `verseKey`, `wordPosition`, and `wordId` on a word press.
- Native Unicode Mushaf and exact WebView Mushaf payloads already include `verseKey`/`location` and `wordPosition`.
- The bundled Mushaf and Quran Foundation word payloads already use the desired location scheme.

Relevant future touchpoints include:

- `components/surah/native/NativeSurahReader.types.ts`
- `components/surah/native/useNativeSurahReaderEvents.ts`
- `components/surah/native/NativeSurahReader.mapper.ts`
- `android/app/src/main/java/com/anonymous/quranappmobile/nativesurahreader/NativeWordLayoutView.kt`
- `android/app/src/main/java/com/anonymous/quranappmobile/nativesurahreader/NativeTajweedTextFactory.kt`
- `components/surah/WordByWordVerse.tsx`
- `components/mushaf/mushafWordPayload.ts`
- `app/surah/[surahId].tsx`
- `src/core/infrastructure/db/`

Shared entities and repository contracts should be added to `../quran-app/src/{domain,application}` first, then synced with `npm run sync:web-core`, in accordance with this repository's core guardrails.

## 4. Recommended user experience

### 4.1 Reader interaction

Use one consistent gesture across modes:

- **Single tap on a word:** open Word Study.
- **Play word:** a speaker action in the quick sheet.
- **Play/seek verse from this word:** an explicit quick-sheet action while the audio player is available.
- An optional long-press-to-seek shortcut may be added later with haptic feedback, but it must not be the only accessible method.

Today, an active audio session changes word tap into seek. That overload should be removed: one gesture should not have a different primary meaning based on hidden playback state.

### 4.2 Quick word sheet

The sheet should appear immediately with a short skeleton only if the local row has not returned yet. Suggested content order:

1. Location and close affordance.
2. Large segmented Arabic word.
3. Segment legend using color + label + shape/underline.
4. Contextual word-by-word gloss.
5. Compact facts:
   - primary POS;
   - lemma;
   - root, or `No root applies to this particle`;
   - verb form/aspect when applicable.
6. Actions:
   - play word;
   - play verse from here;
   - save word;
   - share;
   - `Open full word study`.

Use an explicit numeric modal height derived from `useWindowDimensions()`, following the existing modal guidance, so the sheet cannot collapse to a thin line.

### 4.3 Full study screen

Suggested route: `/study/word/[surah]/[ayah]/[position]`.

Screen structure:

- app bar with surah name and `surah:ayah:word`;
- wrapping full-ayah Arabic selector; tapping another word changes the route parameter without adding history;
- horizontally scrollable tab bar:
  - Morphology;
  - Grammar;
  - Occurrences;
  - Dictionary.

Morphology is the default view and should present:

- the selected segmented Arabic word with color plus readable POS labels;
- contextual meaning from the selected installed word-language pack, or an explicitly labeled bundled-English fallback;
- lemma/citation form;
- root family;
- prefix/stem/suffix/whole-word segment roles;
- POS per segment;
- each source-provided morphology value exactly once on its relevant segment;
- a final `Understanding morphology terms` row that opens the terminology guide.

Surface form, primary POS, repeated whole-word features, inline teaching paragraphs, and the former Overview tab are intentionally omitted from the full screen. Source provenance lives in the Settings-accessible `Word Study Sources` destination rather than the analysis scroll.

Grammar should explain the word's role in this ayah. Full prose i'rab must be treated as a separately sourced, expert-reviewed content layer; it cannot be inferred safely from root/lemma data alone.

Occurrences should show four unambiguous counters when applicable:

- exact normalized surface count;
- lemma count;
- root count;
- number of distinct lemmas/derived families under the root.

Filters should be `Surface`, `Lemma`, and `Root`. Each result should include the location, Arabic form, contextual gloss, a short ayah context, and navigation back to the reader.

### 4.4 Accessibility and localization

- Never encode POS only with color.
- TalkBack/VoiceOver should read each segment and role, for example: `wa — coordinating conjunction; anzala — perfect active verb, form four`.
- Respect Arabic RTL independently from the app content language.
- Render Urdu/Persian contextual meanings RTL while keeping English, Bangla, Hindi, Indonesian, Turkish, and Tamil meanings LTR.
- Keep technical Arabic terms available even in English mode, with a short explanation.
- Support Dynamic Type/font scaling without clipping the ayah selector, Arabic cards, values, or terminology guide.
- Keep per-definition citations where source identity affects content, and expose complete pack provenance through the Settings-accessible `Word Study Sources` destination.

## 5. Architecture

```text
Kotlin reader / Swift reader / Mushaf WebView
        │  emits { verseKey, wordPosition, wordId? }
        ▼
React Native WordStudyController
        │
        ├── local WordStudyRepository ── versioned SQLite study pack
        ├── existing word translations ─ offline language packs
        ├── word/verse audio ─────────── Quran Foundation/CDN + cache
        │
        ├── WordQuickSheet
        └── Full Word Study route ── occurrence navigation / save / lessons
```

### 5.1 Native responsibilities

- render words efficiently;
- preserve reader scroll/landing behavior;
- identify the tapped word;
- highlight the selected word while the sheet is open, if desired;
- emit a small event;
- support clickable word spans in Tajweed mode without sending linguistic data through the bridge.

### 5.2 React Native responsibilities

- normalize the location key;
- query the local repository;
- own sheet and full-screen state;
- own audio actions and reader navigation;
- own saved-word and learning state;
- expose the same UI on Android and iOS;
- cache the current and adjacent word analyses in memory.

### 5.3 Why not query the corpus from Kotlin

The reader needs only hit-testing. Querying morphology in Kotlin would require duplicating repositories, migrations, localization, caching, and presentation on iOS. A single asynchronous SQLite lookup after one bridge event is not a scrolling hot path and will not affect reader performance.

## 6. Data-source decision

| Source | Use | Do not use it for | Decision |
|---|---|---|---|
| Quran Foundation Content API | canonical word locations/text, contextual word translation, transliteration, word audio paths, verse context | root, lemma, POS morphology, full grammar or permanent offline packs under the standard terms | Use through approved credentials/backend for displayed content. Standard developer terms limit caching to one week unless QF expressly permits more. |
| Quranic Arabic Corpus (QAC) v0.4 | segment morphology, POS, features, roots, lemmas, local concordance | modern API calls, full GreenTech-style prose i'rab, guaranteed modern corrections | Conditionally usable. Its page expressly permits use in an app with attribution/link/notice, but also says verbatim only and no changes. Get written confirmation before format conversion, normalization, or corrections. |
| Greentech bundled databases | architecture and UX study | any production ingestion or redistribution | Do not copy. The compiled database has no public reuse license and mixes externally sourced content. |
| Tafsir Center / Surahpedia word-level i'rab and sarf | potential premium deep-grammar layer after an agreement | scraping, copying, or bundling under current public website terms | Exact GreenTech text lineage was observed. The site states all rights reserved; obtain a direct content license and structured export from Tafsir Center. |
| *Meanings of the Words of the Quran, Word by Word* / quran-words.com | potential Arabic concise-meaning layer after permission | scraping or assuming that online visibility permits redistribution | Exact GreenTech meaning wording was observed. No open-data license was found; request permission from the rights holder. |
| Golden Quran resources | provenance/quality comparison | assuming every bundled database is safe merely because the repository is MIT | Repository is MIT-licensed, but review content-level sources and notices for each database before use. It is not the observed source of the tested GreenTech i'rab/sarf record. |
| `mustafa0x/quran-morphology` | correction comparison and QA | production source without an explicit license review | Useful fork with documented corrections, but its relationship to QAC's no-change term needs legal clarification. |
| QuranMorph (2025) / QAMAR (2026) | evaluate lemma/POS quality and future migration | immediate production use before the exact downloadable artifact and its data license are confirmed | Papers describe valuable manually reviewed data, but a paper's license or an “open-source” statement is not a substitute for a dataset license file. |
| Extended Quranic Treebank / UD-Quran | later dependency/syntax visualization | MVP word sheet | Consider later, after expert validation. UD-Quran is published under CC BY 4.0; the upstream treebank mixes converted, automated, and expert-validated layers. |
| Qutrub | possible build-time verb conjugation research | direct app embedding without GPL/legal review | Defer. MVP can accurately show the encountered verb's QAC features without generating a full paradigm. |

Primary references:

- QAC download and terms: https://corpus.quran.com/download/
- QAC morphology documentation: https://corpus.quran.com/documentation/morphologicalfeatures.jsp
- QAC Java API: https://corpus.quran.com/java/
- Quran Foundation developer terms: https://api-docs.quran.foundation/legal/developer-terms/
- Quran Foundation field reference: https://api-docs.quran.com/docs/api/field-reference/
- Quran Foundation word audio guidance: https://api-docs.quran.foundation/docs/sdk/javascript/verses/
- Greentech public Quran Corpus wiki: https://gitlab.com/greentech/quran/quran-android/-/wikis/Quran-corpus
- Greentech Quran Corpus comparison issue: https://gitlab.com/greentech/quran/quran-android/-/work_items/278
- Greentech public feature guide: https://gtaf.org/blog/deepen-your-quran-understanding-with-the-quran-app/
- Surahpedia word-level projects: https://surahpedia.com/ar/projects?type=word
- Golden Quran resources and MIT license: https://github.com/salemoh/GoldenQuranRes
- Quran word meanings reference: https://www.quran-words.com/
- QuranMorph paper: https://arxiv.org/abs/2506.18148
- QAMAR paper: https://aclanthology.org/2026.abjadnlp-1.38/
- UD-Quran dataset: https://zenodo.org/records/18634813

### 6.1 Licensing gate

QAC's page combines GPLv3 with content-specific terms requiring source attribution, a link, copyright notice preservation, verbatim distribution, and no changes. The page explicitly permits use of its annotation in an application, so this is not a blanket prohibition. The uncertainty is whether conversion into a normalized SQLite pack and corrections count as prohibited changes and what source-delivery obligations apply. Before distributing such a derivative:

1. Ask the current QAC/Quran Foundation maintainer for written permission to convert and distribute the annotation in a versioned SQLite pack.
2. Preserve source/version/license metadata in the pack and app UI.
3. If permission is limited to verbatim distribution, ship the original source file verbatim and create the SQLite cache locally on the device, or select a clearly licensed alternative.
4. Do not merge corrections into a QAC-derived production pack until the permission covers modifications.

For Quran Foundation API content, the standard terms permit display inside a beneficial Quran application but prohibit storage for longer than one week unless expressly permitted. Therefore it cannot be the legal basis for a permanently bundled offline study pack without separate written permission.

For Surahpedia, quran-words.com, or GreenTech's compiled database, no public open-data permission sufficient for copying/bundling was found. Treat these as **do not ship** until a signed license or explicit written grant identifies the exact fields, languages, platforms, offline redistribution rights, modification rights, attribution wording, and duration.

For UD-Quran, CC BY 4.0 permits copying and adaptation with attribution and change notices. Still preserve all upstream notices, confirm that the deposited artifact covers the intended files, and complete scholarly QA before treating its automatic/converted syntax as authoritative.

This is a release blocker, not a post-launch paperwork task.

## 7. Offline pack design

### 7.1 Recommendation

Ship a compact **Core Word Study** pack with the app so the first tap works offline. Use the existing hosted-pack concepts for signed/versioned updates. Make larger language and deep-grammar resources optional downloads.

Suggested layers:

- Core Word Study, bundled:
  - word location;
  - segments and POS;
  - structured morphology;
  - root and lemma IDs;
  - occurrence indexes/counts;
  - English contextual gloss where redistribution is allowed.
- Word language packs, existing/optional:
  - Bangla, Urdu, Hindi, Indonesian, Persian, Turkish, Tamil, and others.
- Deep Arabic Grammar, optional:
  - full prose i'rab and sarf;
  - must have separate provenance, license, and expert review.
- Dictionary packs, optional:
  - root/lemma definitions and citations from licensed lexicons.

Greentech's entire 72.7 MB corpus database compresses to about 9.7 MB, demonstrating that full offline morphology is practical. A normalized core pack without repeated prose should be smaller.

### 7.2 Keep the study database separate

Use a read-mostly `quran_word_study_<version>.db` rather than adding 77,429 linguistic rows to `quran_app.db` migrations.

Benefits:

- atomic version replacement;
- checksum verification and rollback;
- simpler deletion/update;
- no long app-database migration;
- source/license metadata travels with the content;
- the app database remains for user state and installed-pack records.

### 7.3 Proposed schema

```sql
word_analysis(
  location TEXT PRIMARY KEY,       -- 3:3:9
  verse_key TEXT NOT NULL,         -- 3:3
  word_position INTEGER NOT NULL,
  surface_uthmani TEXT NOT NULL,
  normalized_surface TEXT NOT NULL,
  lemma_id INTEGER,
  root_id INTEGER,
  primary_pos TEXT,
  verb_form TEXT,
  aspect TEXT,
  mood TEXT,
  voice TEXT,
  person TEXT,
  gender TEXT,
  number TEXT,
  grammatical_case TEXT,
  grammatical_state TEXT,
  derivation TEXT,
  source_version TEXT NOT NULL
);

morpheme(
  location TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  arabic TEXT NOT NULL,
  segment_type TEXT NOT NULL,      -- prefix/stem/suffix
  pos_code TEXT NOT NULL,
  features_json TEXT,
  PRIMARY KEY(location, segment_index)
);

lemma(
  id INTEGER PRIMARY KEY,
  arabic TEXT NOT NULL,
  normalized TEXT NOT NULL,
  pos_code TEXT,
  occurrence_count INTEGER NOT NULL
);

root(
  id INTEGER PRIMARY KEY,
  arabic TEXT NOT NULL,
  normalized TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL,
  lemma_count INTEGER NOT NULL
);

word_gloss(
  location TEXT NOT NULL,
  language_code TEXT NOT NULL,
  text TEXT NOT NULL,
  source_id TEXT NOT NULL,
  PRIMARY KEY(location, language_code, source_id)
);

source_metadata(
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  version TEXT,
  license TEXT NOT NULL,
  url TEXT NOT NULL,
  checksum TEXT
);
```

Required indexes:

- `(verse_key, word_position)`;
- `normalized_surface`;
- `lemma_id`;
- `root_id`;
- `(root_id, lemma_id)`;
- `(language_code, location)` for separate language tables/packs.

Occurrences should be derived from indexed `word_analysis` rows rather than stored as duplicated lists. Counts may be precomputed in `lemma` and `root` for instant display.

## 8. Native event contract

Use one contract everywhere:

```ts
type WordStudyPressEvent = {
  verseKey: string;
  wordPosition: number;
  wordId?: number;          // advisory only
  surfaceText?: string;     // optimistic UI only
  source: 'translation' | 'mushaf' | 'tajweed';
};
```

The repository key is always `${verseKey}:${wordPosition}`. `wordId` must never be used for a cross-dataset join.

Android plain mode already keeps token views mounted. Android Tajweed mode will need per-word clickable spans or an equivalent word-to-glyph range map. Do not replace Tajweed with dozens of nested buttons. Existing `codeV2` metadata is already stored per `NativeSurahReaderWord`, so this can be added without a new network source.

## 9. Phase-by-phase execution plan

This section is the implementation contract. A future AI task can be stated simply as:

> Complete Phase N from `docs/word-study-feature-plan.md`. Do only that phase, satisfy every exit criterion, update the progress record, run the required verification, and stop.

### 9.1 Rules for every phase

1. Execute exactly one phase per task or pull request. Do not start the next phase automatically.
2. Read this plan and the repository `AGENTS.md` before changing files. Inspect and extend existing components, repositories, hooks, and pack infrastructure before creating new patterns.
3. Keep `src/core/domain` and `src/core/application` platform-agnostic. Changes to shared core must be made in `../quran-app` first and then synced with `npm run sync:web-core`.
4. Preserve unrelated user changes. Do not perform broad refactors or introduce libraries unless the phase cannot be completed with the existing stack.
5. Add tests in the same phase as the behavior they protect. Do not leave testing for the final phase.
6. Update `docs/word-study-progress.md` with decisions, completed acceptance criteria, test output, unresolved risks, and the exact next phase. Phase 0 creates this file.
7. Always run `npm run verify`. Run the relevant Android/iOS build and targeted tests whenever native or platform code changes.
8. If an exit criterion cannot be met, stop and report the concrete blocker. Do not mark the phase complete or silently reduce its scope.
9. The handoff must list changed files, verification performed, manual checks still required, and explicitly state that no later phase was started.

### Phase 0 — Lock content rights and product contract

**Goal:** remove decisions that could invalidate later implementation. This is primarily a product, licensing, and linguistic-review phase, not a feature-code phase.

**In scope:**

- Create `docs/word-study-progress.md` with the complete phase checklist.
- Create a field-level source ledger covering surface text, segmentation, POS, morphology features, lemma, root, contextual gloss, occurrence indexes, audio, prose i'rab, sarf, dictionary definitions, and verb paradigms.
- Record the exact artifact, version, URL, license, attribution, modification rights, offline redistribution rights, caching restrictions, and checksum for every proposed MVP field.
- Obtain written QAC format-conversion/offline-distribution permission, or formally choose a different clearly licensed morphology artifact.
- Lock the MVP fields. Prose i'rab, dictionary prose, generated conjugation, and dependency graphs remain excluded unless separately licensed.
- Approve the event key `${surah}:${ayah}:${wordPosition}`, tap behavior, quick-sheet content order, full-screen sections, and English/Arabic grammar terminology.
- Define a stratified 100-word golden review set and reviewer/sign-off workflow.

**Exit criteria:**

- Every field planned for the MVP has a known, recorded shipping right; no `unknown` or `probably allowed` entry remains.
- The selected morphology artifact is obtainable reproducibly and its checksum is recorded.
- A qualified Quranic Arabic reviewer has approved the terminology and review method; a second reviewer is required before public release for disputed records.
- The product contract does not promise unlicensed prose grammar or verb paradigms.
- No application feature code has been implemented.

**Do not include:** SQLite compiler work, repository interfaces, sheets, routes, or reader changes.

### Phase 1 — Shared models, contracts, and golden fixtures

**Goal:** define a platform-neutral contract before storage or UI implementation.

**In scope:**

- Add shared domain models for `WordAnalysis`, `Morpheme`, `MorphologyFeatures`, `Lemma`, `Root`, source attribution, and paginated occurrences.
- Add shared repository/use-case interfaces for lookup by location and occurrence queries.
- Add strict location parsing/formatting and never join through a Quran Foundation numeric word ID.
- Define structured missing/unsupported states for particles, proper nouns, absent roots, absent lemmas, and unavailable licensed layers.
- Convert the Phase 0 golden set into deterministic fixtures and contract tests.
- Make shared-core changes in the web repository first, sync them, and document the source-of-truth paths.

**Exit criteria:**

- Shared core passes purity checks and contains no React Native, Expo, browser, SQLite, or native-platform dependency.
- Contract tests cover valid/invalid locations, segmented and unsegmented words, rootless words, verbs, and pagination.
- Models carry source/version identifiers without embedding presentation copy.
- `npm run verify` passes.

**Do not include:** production corpus compilation, SQLite access, UI, or native reader changes.

### Phase 2 — Reproducible offline study-pack compiler

**Goal:** generate the complete read-only SQLite artifact independently of the app.

**In scope:**

- Implement a deterministic source-to-SQLite compiler using only the Phase 0 approved artifacts.
- Implement the schema and indexes in Section 7, source metadata, checksums, compiler version, and change notices.
- Validate ayah/word alignment against this app's canonical word payload.
- Derive surface, lemma, and root counts from indexed records rather than copying GreenTech totals.
- Produce a machine-readable and human-readable validation report with exceptions.
- Add compiler tests for the golden fixtures, normalization, duplicate detection, missing foreign keys, counts, and deterministic output.

**Exit criteria:**

- Expected 6,236 ayahs and 77,429 canonical word locations match, or every exception is explicitly reviewed and recorded.
- Two identical inputs produce byte-identical output, or a documented deterministic SQLite canonicalization produces identical logical checksums.
- Every row traces to source ID/version and every count matches golden fixtures.
- The compiler never reads GreenTech's APK/database or scrapes an unlicensed website.
- Compiler tests and `npm run verify` pass.

**Do not include:** mobile database access, pack downloading, sheets, routes, audio, or native reader code.

### Phase 3 — Mobile repository and pack lifecycle

**Goal:** make the approved pack reliably queryable offline through the shared contracts.

**In scope:**

- Add the mobile SQLite repository in `src/core/infrastructure`.
- Bundle/install the initial pack using existing app pack patterns where possible.
- Add catalog metadata, schema/version compatibility checks, checksum verification, atomic replacement, rollback, and corruption recovery.
- Add a small cancellable LRU cache for word, lemma, and root queries.
- Implement lookup and paginated occurrence use cases without adding UI.
- Add repository integration tests and a benchmark harness.

**Exit criteria:**

- Offline cold-start lookup works with networking disabled.
- Location lookup is under 50 ms p95 and the first 50 lemma/root results are under 100 ms p95 on representative devices or CI-equivalent profiling, with measurements recorded.
- Corrupt, missing, incompatible, and interrupted-update packs fail safely and recover/rollback.
- Golden counts and pagination pass through the real repository.
- `npm run verify` and relevant mobile database tests pass.

**Do not include:** quick sheet, full study route, or reader behavior changes.

### Phase 4 — Quick sheet in the primary Surah reader

**Goal:** provide the first complete user-facing vertical slice while preserving reader performance.

**In scope:**

- Normalize the existing word-press payload to the Section 8 event contract for the primary Android plain/word-by-word Surah reader.
- Change a normal word tap to open Word Study; preserve an explicit way to seek/play from that word when audio is active.
- Implement the reusable React Native quick sheet with explicit numeric height constraints.
- Show location, segmented word, color-plus-text POS legend, contextual gloss, primary POS, lemma, root/absence explanation, current inflection, source label, and word/verse audio actions.
- Add skeleton, missing-analysis, repository-error, and retry states.
- Restore reader selection/position after closing and add baseline accessibility labels.
- Add a visible `Open full word study` action that may route to a clearly marked placeholder until Phase 5.

**Exit criteria:**

- A tap begins presenting the sheet within 100 ms and offline content resolves within 150 ms p95 after tap, with measurements recorded.
- Long-Surah scrolling and active audio show no material regression.
- Morphology is queried only after tap; it is not added to every verse bridge payload.
- Rootless/unsupported words show an explanation rather than an empty or broken card.
- Component tests, `npm run verify`, Android build, and manual Surah 2 checks pass.

**Do not include:** complete full-screen study, occurrence lists, Tajweed hit-testing, Mushaf integration, or iOS parity.

### Phase 5 — Full study Overview and Morphology

**Goal:** add the shared cross-platform deep-study screen without occurrence browsing yet.

**In scope:**

- Implement `/study/word/[surah]/[ayah]/[position]` in React Native.
- Add the ayah word ribbon, selected-word state, and adjacent-word navigation.
- Implement Overview and Morphology sections/tabs with beginner explanations beside technical terms.
- Distinguish surface form, lemma, and root explicitly.
- Add source/version/about-analysis presentation and share attribution.
- Preserve study state and reader return position.

**Exit criteria:**

- The quick-sheet action opens the selected location and ribbon navigation changes words correctly.
- Particles, attached pronouns, nouns, and verbs render only applicable fields without misleading blanks.
- Deep links, back navigation, dark theme, RTL, and font scaling work on representative screens.
- UI tests, `npm run verify`, and Android build pass.

**Do not include:** occurrence result lists, full prose i'rab, dictionaries, saved-word learning, or additional reader modes.

### Phase 6 — Occurrence explorer and reader round-trip

**Goal:** complete the core learning loop for surface, lemma, and root exploration.
**In scope:**

- Add unambiguous surface, lemma, root, and root-family/lemma counters where applicable.
- Add `Surface`, `Lemma`, and `Root` filters with indexed, paginated results.
- Show location, Arabic form, contextual gloss, and concise ayah context for each result.
- Navigate from a result to the correct reader location and return to the same study tab/filter/scroll state.
- Handle very large roots, missing glosses, duplicate normalized surfaces, and cancelled/stale queries.

**Exit criteria:**

- All counts and the first/last pages match golden compiler fixtures.
- No UI uses ambiguous wording such as `this word occurs N times` without naming surface, lemma, or root.
- A 500+ occurrence root remains responsive and memory-bounded.
- Reader round-trip restores both study state and reading position.
- Query/UI tests, `npm run verify`, and Android build pass.

**Do not include:** saved-word review, dictionary definitions, dependency trees, or prose grammar packs.

### Phase 7 — Android coverage across all existing reader modes

**Goal:** make the same React Native study product available from every Android reader without duplicating the study UI.

**In scope:**

- Add accurate clickable word ranges for Android Tajweed rendering using spans or the existing word-to-glyph metadata.
- Integrate existing Mushaf, Juz, and Page reader word payloads with the same event contract.
- Preserve current target landing, scroll anchors, selection, Tajweed rendering, and audio behavior.
- Add parity tests confirming the same location opens the same analysis in each mode.

**Exit criteria:**

- Every existing Android reader mode can open the same location and shared study screen.
- No Kotlin quick-sheet, deep-screen, repository, or linguistic model duplication is introduced.
- Tajweed glyph rendering and touch ranges pass representative edge cases, including attached marks and line boundaries.
- `npm run verify`, Android build/tests, and manual reader-mode matrix pass.

**Do not include:** new reader modes, a new native iOS reader, or learning tools.

### Phase 8 — iOS and cross-platform parity (deferred)

**Scheduling decision:** Phase 8 is intentionally skipped for the current Android-first release. It is not an Android release blocker. Start it only when active iOS application development or an iOS release begins.

**Goal when resumed:** expose the existing shared experience on iOS with only platform hit-testing/event work.

**In scope:**

- Connect current iOS/React Native reader word presses and Mushaf word payloads to the shared event contract.
- If a Swift native reader already exists, make it emit the contract; do not create a new Swift reader solely for this feature.
- Verify SQLite pack installation/replacement, audio actions, deep links, modal sizing, gestures, and reader return behavior on iOS.
- Fix platform-specific accessibility and layout differences without forking the product UI.

**Exit criteria:**

- The same canonical location returns identical sourced analysis and counts on Android and iOS.
- No separate Swift study UI or repository exists.
- VoiceOver, Dynamic Type, RTL, dark theme, and safe-area behavior pass the iOS test matrix.
- `npm run verify`, iOS build/tests, and manual parity matrix pass.

**Do not include:** redesign, extra content sources, or post-MVP learning features.

### Phase 9A — Android MVP release hardening

**Goal:** make the completed Android feature safe, measurable, accessible, and releasable without waiting for Phase 8.

**In scope:**

- Complete English/Arabic copy review and Quranic Arabic review of the golden set plus sampled production records.
- Complete Android TalkBack, RTL, system font scaling, reduced-motion, contrast, and non-color POS checks.
- Run long-Surah, large-root, low-memory, offline, corrupt-pack, update/rollback, active-audio, and rapid-tap stress tests.
- Verify source notices, licenses, attribution links, data version, corrections/change notices, and privacy behavior in the Android release build.
- Add privacy-safe feature analytics only if the app already has an approved analytics path; never send studied words, reading content, notes, or religious-profile data.
- Update product documentation, component documentation, release notes, and the final progress record.
- Produce a separate manual physical-device checklist. Automated checks do not replace device testing or scholarly review.

**Exit criteria:**

- All Phase 0–7 acceptance criteria remain green in an Android release-candidate build. Deferred Phase 8 is not part of this gate.
- No critical/high accessibility, integrity, privacy, licensing, navigation, or performance defect remains.
- One qualified reviewer signs off the complete golden set and a second resolves any disputed items.
- The Android physical-device accessibility/stress matrix and Android release build pass; `npm run verify` passes.
- `docs/word-study-progress.md` marks the Android MVP complete with source versions/checksums, manual sign-offs, and known non-blocking limitations.

**Do not include:** Phase 8, iOS verification, new functionality, or post-MVP features. Any requested feature expansion becomes a later phase.

### Phase 9B — iOS release hardening (deferred)

**Scheduling decision:** run this immediately after the deferred Phase 8 and before an iOS public release. It does not block Android Phase 9A or Android post-MVP work.

**In scope:**

- Re-run shared data-integrity, licensing, privacy, source-notice, navigation, and pack-lifecycle checks against the iOS release candidate.
- Complete VoiceOver, Dynamic Type, RTL, reduced-motion, contrast, safe-area, modal-gesture, audio, deep-link, and reader-return testing on representative physical iOS devices.
- Confirm that Android fixes and later shared React Native changes have not introduced iOS parity regressions.

**Exit criteria:**

- Phase 8 acceptance criteria remain green in the iOS release-candidate build.
- The physical-device iOS accessibility/stress matrix and iOS release build pass.
- No separate Swift study UI/repository exists, no critical/high iOS defect remains, and `npm run verify` passes.
- The progress record identifies the exact iOS build, devices, source versions/checksums, and sign-offs.

**Do not include:** redesign, new content sources, or unrelated post-MVP features.

### 9.2 Post-MVP phases

These remain independent phases and must never be bundled into a release-hardening phase. They may begin after Android Phase 9A even while Phase 8 and Phase 9B remain deferred:

- **Phase 10 — Licensed deep grammar pack:** implemented as a separate verse-keyed offline SQLite pack containing ordered Arabic i'rab passages. The Grammar tab prioritizes passages matching the selected surface/morpheme, keeps the full ayah analysis expandable, and provides explicit loading/missing states. The compiler and manifest preserve provenance, checksums, coverage, and source order; the app does not generate or rewrite the prose. Distribution permission and qualified Quranic Arabic review remain mandatory release gates.
- **Phase 11A — Downloadable dictionary packs:** implemented as separate optional English Lane and Hans Wehr Quran-focused SQLite packs. The Dictionary tab remains visible without a pack, installs sources independently, prefers exact lemma headwords, falls back to root articles/families, lazy-loads long definitions, and shows source/version attribution.
- **Phase 11B — Verb reference packs:** deferred until a structured reviewed source can supply verified principal parts; Lane/Hans prose is not parsed into canonical paradigms.
- **Phase 12 — Saved words and review:** saved word/root collections, local learning state, review queue, and basic spaced repetition.
- **Phase 13 — Structured lessons and quizzes:** grammar-term mini-lessons, high-frequency vocabulary path, coverage score, segmentation/POS quizzes, and progress reporting.
- **Phase 14 — Advanced syntax:** dependency graphs with a beginner explanation and technical tree view using a clearly licensed, reviewed treebank.
- **Phase 15 — Grounded study assistant:** retrieval-grounded explanations over licensed reviewed sources, citations, uncertainty, feedback/reporting, and strict safeguards against generating canonical morphology or i'rab.

Each post-MVP phase requires its own detailed scope and acceptance criteria before implementation. Do not use an LLM to generate canonical roots, morphology, occurrence counts, dictionary definitions, verb paradigms, or i'rab. An AI assistant may explain reviewed structured data later, but it must not replace it.

## 10. Team competencies and ownership

| Competency | Responsibility | Required phase |
|---|---|---|
| Arabic linguist/Quranic Arabic reviewer | source selection, terminology, golden fixtures, dispute resolution, i'rab review | 0 onward |
| Data engineer | corpus parser, normalization, location validation, SQLite pack, checksums, reports | 0–1 |
| React Native engineer | repository integration, sheet, routes, navigation, caching, accessibility | 1–4 |
| Android/Kotlin engineer | reader hit-testing, Tajweed ranges, performance regression protection | 2 and 4 |
| iOS/Swift engineer | future native reader event parity; no duplicate study UI | 4 |
| Product/UX designer | progressive disclosure, learner modes, RTL, source/confidence presentation | 0–5 |
| QA/accessibility | golden data tests, offline/update tests, TalkBack/VoiceOver, performance | every phase |

A language reviewer is a core delivery role, not an optional final approver. Grammar data can imply meaning, and disagreements must be represented as sourced editorial decisions.

## 11. Performance and quality gates

- Never attach full morphology objects to all verse payloads.
- Query only after tap; prefetch at most the visible word's neighbors.
- Keep occurrence queries indexed and paginated.
- Maintain a small LRU cache keyed by location, lemma, and root.
- Run database work off the UI thread and cancel stale sheet requests.
- Preserve `NativeSurahReader` atomic target placement and stable scroll anchors.
- Verify Surah 2, long occurrence roots, Tajweed, word-by-word, dark theme, and active audio.
- Add compiler assertions for 6,236 ayahs and 77,429 word locations.
- Snapshot representative morphology cards in English and Arabic.
- Store source/version on every compiled record or pack layer.

## 12. Principal risks

1. **Licensing:** converting or correcting QAC data without permission can block release.
2. **False equivalence:** surface, lemma, root, and semantic sense are not interchangeable counts.
3. **Token alignment:** joining by numeric API ID will eventually corrupt results; location must be canonical.
4. **Grammar overclaim:** QAC morphology does not automatically provide a full prose i'rab explanation.
5. **Audio gesture regression:** changing tap behavior without an explicit replacement for seek will frustrate current users.
6. **Tajweed hit-testing:** glyph fonts require explicit word ranges; overlay boxes based on guessed coordinates will be fragile.
7. **Unreviewed generated content:** automatic conjugation or AI explanation can be fluent and wrong.
8. **Platform duplication:** a native deep screen on Android will make iOS parity expensive and slow every later feature.

## 13. Definition of MVP

The product MVP is implemented when a user can tap any supported word in the reader, immediately see an offline quick sheet, open the shared study screen, understand its segments and structured morphology, distinguish surface/lemma/root counts, inspect every occurrence, play the word or verse from that point, and navigate back without losing reading position.

The **Android MVP is release-ready** after Phase 9A passes. It does not wait for iOS. The **iOS release is ready** only after the deferred Phase 8 and Phase 9B pass. Both platforms continue to use the same React Native study UI, domain contracts, and offline data pack.

Full prose i'rab, a six-form verb paradigm, dependency graphs, dictionaries, and quizzes are valuable, but they are not allowed to delay the accurate offline foundation.
