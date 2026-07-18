# Word Study Progress

Status: Android Phase 9A automated hardening checks passed locally, but Android MVP approval remains blocked by qualified Quranic Arabic reviewer sign-off and the Android physical-device accessibility/stress matrix on a production-signed artifact. Phase 8 iOS parity remains intentionally deferred and does not block Android.
Last updated: 2026-07-18.

This file tracks execution of `docs/word-study-feature-plan.md`. It is the product, rights, review, data, and implementation record for Word Study.

## Phase Checklist

| Phase | Status | Notes |
|---|---|---|
| Phase 0 - Lock content rights and product contract | Done, reviewer follow-up remains | Product owner confirmed written QAC conversion/offline redistribution permission and the canonical translation/Mushaf offline rights on 2026-07-16. Reviewer sign-off remains required before public release. |
| Phase 1 - Shared models, contracts, and golden fixtures | Done, with Phase 0 caveat | Completed by explicit user request on 2026-07-16 as a platform-neutral contract only. Fixtures are deterministic contract fixtures, not approved production morphology content. |
| Phase 2 - Reproducible offline study-pack compiler | Done | Deterministic QAC v0.4-to-SQLite compiler, complete generated pack, reports, checksums, indexes, and focused tests completed on 2026-07-16. |
| Phase 3 - Mobile repository and pack lifecycle | Done | Expo SQLite repository, bundled/hosted pack lifecycle, SHA-256/schema/integrity validation, atomic activation/rollback, bounded cancellable caches, real-pack tests, and benchmark harness completed on 2026-07-16. |
| Phase 4 - Quick sheet in the primary Surah reader | Done | Canonical native tap contract, reusable quick sheet, offline states, explicit word/verse playback, accessibility baseline, Phase 5 placeholder, release-mode timing checks, and Surah 2 manual checks completed on 2026-07-17. |
| Phase 5 - Full study Overview and Morphology | Done | Offline ayah ribbon, route-driven selection, adjacent navigation, Overview/Morphology tabs, beginner explanations, source/version details, and attributed sharing completed on 2026-07-17. |
| Phase 6 - Occurrence explorer and reader round-trip | Done | Explicit counters, availability-aware Surface/Lemma/Root filters, cancellable fixed-size pages, ayah context, exact-word reader targeting, and tab/filter/page/scroll restoration completed on 2026-07-17. |
| Phase 7 - Android coverage across all existing reader modes | Done | Shared canonical events and one React Native sheet now cover Surah native plain/word-by-word/Tajweed plus Surah/Juz/Page Translation and exact Mushaf views; parity tests, Android range tests, build/install, and emulator matrix completed on 2026-07-17. |
| Phase 8 - iOS and cross-platform parity | Deferred | Intentionally skipped for the Android-first release. Resume only when active iOS development/release begins; this checkout currently has no `ios/` project. |
| Phase 9A - Android MVP release hardening | Blocked, automated checks passed | Documentation, source/checksum, privacy records, manual Android checklist, `npm run verify`, repository benchmark, Android unit tests, release Kotlin compile, and local release APK assemble passed on 2026-07-17. Android MVP approval still requires reviewer sign-off and the physical-device matrix on a production-signed artifact. |
| Phase 9B - iOS release hardening | Deferred | Run only after deferred Phase 8 and before an iOS public release. It does not block Android release or Android post-MVP work. |
| Phase 10 - Licensed deep grammar pack | Implemented, release permission/review pending | Separate bundled SQLite grammar pack, shared contracts, repository, professional Arabic Grammar tab, selected-word passage matching, full-ayah disclosure, missing states, compiler checksums, and tests completed on 2026-07-17. Distribution permission and qualified review remain release blockers. |
| Phase 11A - Downloadable dictionary packs | Implemented | Optional Lane/Hans Wehr English packs, deterministic Quran-focused compiler, multi-pack lifecycle, Downloads integration, shared contracts, and Dictionary tab completed on 2026-07-18. |
| Phase 11B - Verb reference packs | Deferred | Waiting for a structured reviewed principal-parts source; no paradigms are inferred from dictionary prose. |
| Phase 12 - Saved words and review | Future | Post-MVP only. |
| Phase 13 - Structured lessons and quizzes | Future | Post-MVP only. |
| Phase 14 - Advanced syntax | Future | Post-MVP only. |
| Phase 15 - Grounded study assistant | Future | Post-MVP only. |

## Phase 0 Acceptance Status

| Requirement | Status | Record |
|---|---|---|
| Create this progress file with the complete phase checklist | Done | This document. |
| Create field-level source ledger | Done, not approved | See source ledger below. |
| Record exact artifact, version, URL, license, attribution, modification rights, offline redistribution rights, caching restrictions, and checksum for proposed MVP fields | Partial | Checksums are recorded where artifacts are publicly reachable without credentials. Several field rights remain unapproved. |
| Obtain written QAC conversion/offline-distribution permission, or choose a clearly licensed morphology artifact | Done by product-owner confirmation | The user/product owner confirmed the permission request was emailed and settled; the correspondence remains outside the repository. QAC v0.4 is the selected source. |
| Lock MVP fields | Done, with blockers | Core MVP excludes prose i'rab, dictionary prose, generated conjugation, and dependency graphs. Morphology fields remain blocked until source rights are approved. |
| Approve event key, tap behavior, quick-sheet order, full-screen sections, terminology | Product-approved for implementation planning | Requires reviewer confirmation for grammar terminology before Phase 1 fixtures. |
| Define stratified 100-word golden review set and workflow | Done, pending reviewer approval | Candidate set below; reviewer may replace records before fixture creation. |
| Every Phase 2 field has known shipping right | Done by product-owner confirmation | QAC morphology and the existing offline canonical word pack were confirmed. Audio, prose grammar, and dictionaries are not part of this pack. |
| Selected morphology artifact obtainable reproducibly with checksum | Done | Original QAC morphology v0.4 is selected; SHA-256 `a1d12923815341face765083805d2148ed2d9f5cc3f7d6665219d887675d8c46`. |
| Qualified Quranic Arabic reviewer approved terminology and method | Not met | Reviewer not yet named/signature not captured. |
| Product contract excludes unlicensed prose grammar or verb paradigms | Done | Exclusions are locked below. |
| No application feature code implemented | Done | Only this documentation file was added. |

## Product Contract Locked For MVP

Canonical key: `${surah}:${ayah}:${wordPosition}`. `wordId` is advisory only and must not be used for cross-source joins.

Primary tap behavior: single tap on a supported word opens Word Study. Audio seek/play from a word must be exposed as an explicit action, not as an overloaded hidden tap behavior.

Quick-sheet order:
1. Location and close affordance.
2. Large segmented Arabic word.
3. Segment legend using color plus text/shape, never color alone.
4. Contextual gloss when a licensed source is available.
5. Primary POS, lemma, root or explicit rootless explanation, and current inflection when applicable.
6. Actions: play word, play verse from here, save word placeholder when not yet implemented, share, and `Open full word study`.

Full-screen route: `/study/word/[surah]/[ayah]/[position]`.

Full-screen sections: Overview, Morphology, Grammar, Occurrences, and Dictionary. Phase 10 adds source-provided Arabic prose i'rab. Phase 11A adds optional cited dictionary definitions; generated conjugation tables, dependency graphs, and AI-generated canonical analysis remain excluded.

Terminology baseline, pending reviewer approval:

| English UI term | Arabic technical term | Handling |
|---|---|---|
| segment | مقطع | Show per-prefix/stem/suffix role. |
| part of speech | نوع الكلمة / قسم الكلمة | Show POS code plus readable label. |
| prefix | سابقة | Explain attached leading segment. |
| stem | أصل الكلمة / الجذع | Use source terminology if reviewer prefers one form. |
| suffix | لاحقة | Explain attached ending segment. |
| lemma | الصيغة المعجمية | Distinguish from surface form. |
| root | الجذر | Explain when no root applies. |
| case | الإعراب | Use only for structured case labels, not full prose i'rab. |
| mood | الجزم/النصب/الرفع | Apply to verbs only when present in source. |
| voice | المبني للمعلوم/المجهول | Apply only when source explicitly records it. |
| aspect | الماضي/المضارع/الأمر | Avoid calling this a full verb paradigm. |

## Field-Level Source Ledger

Sources checked on 2026-07-16:

- Quranic Arabic Corpus download page: https://corpus.quran.com/download/
- Quran Foundation Developer Terms: https://api-docs.quran.foundation/legal/developer-terms/
- Mendeley `Quranic` dataset v1: https://data.mendeley.com/datasets/rk96pn66m4/1
- `NoorBayan/Quranic` repository: https://github.com/NoorBayan/Quranic
- `mustafa0x/quran-morphology` repository: https://github.com/mustafa0x/quran-morphology

| MVP field | Proposed source | Artifact/version/URL | License and attribution | Modification rights | Offline redistribution/caching | Checksum | Decision |
|---|---|---|---|---|---|---|---|
| Location key | App contract derived from existing reader payloads | `${verseKey}:${wordPosition}` | App-owned contract | App-owned | App-owned | N/A | Approved. |
| Surface text | Existing app offline English word pack | `dist/word-translation-packs/languages/en/2026-07-04/payload.json` | Offline distribution rights confirmed by product owner | Do not modify Quran text; canonical pack is authoritative | Confirmed by product owner | `38975bff99637665869e8231d1d5824b1bc4db4c6cd3b6358b8231d4e882b6f3` | Approved for Phase 2. |
| Segmentation | Original QAC morphology v0.4 | https://corpus.quran.com/download/ | QAC attribution/copyright retained; written conversion permission confirmed by product owner | Mechanical Buckwalter/SQLite conversion and location normalization permitted; annotations are not corrected | Offline app redistribution confirmed by product owner | `a1d12923815341face765083805d2148ed2d9f5cc3f7d6665219d887675d8c46` | Approved for Phase 2. |
| POS | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Approved for Phase 2. |
| Morphology features | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Approved for Phase 2. |
| Lemma | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Approved for Phase 2. |
| Root | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Same as segmentation | Approved for Phase 2. |
| Occurrence indexes/counts | Derived by compiler from approved surface/lemma/root records | Generated SQLite pack | App-owned deterministic derivation over approved fields | Compiler-owned derivation; no source annotation corrections | Ships with approved input fields | Logical SHA-256 `9c730ace19a57a724b3198fd80f3ed75f2e388c203525aaaaf2ee99af6ebc32d` | Approved and generated. |
| Contextual gloss | Existing app offline English word pack | `dist/word-translation-packs/languages/en/2026-07-04/payload.json` | Offline distribution rights confirmed by product owner | Gloss text retained verbatim | Confirmed by product owner | `38975bff99637665869e8231d1d5824b1bc4db4c6cd3b6358b8231d4e882b6f3` | Approved for Phase 2. |
| Audio | Quran Foundation/CDN or existing app audio infrastructure | QF terms and audio docs | Display/playback within app may be allowed under QF terms | No content modification | Long-term caching beyond one week requires permission | N/A | Exclude from core offline pack; runtime/ephemeral use only until permission is recorded. |
| Prose i'rab | None for MVP | N/A | N/A | N/A | N/A | N/A | Excluded. Future licensed deep grammar pack only. |
| Sarf prose | None for MVP | N/A | N/A | N/A | N/A | N/A | Excluded. Future licensed deep grammar pack only. |
| Dictionary definitions | None for MVP | N/A | N/A | N/A | N/A | N/A | Excluded. Future dictionary pack only. |
| Verb paradigms | None for MVP | N/A | N/A | N/A | N/A | N/A | Excluded. Future licensed/reviewed verb reference only. |
| Dependency graphs | None for MVP | N/A | N/A | N/A | N/A | N/A | Excluded. Future reviewed syntax phase only. |

Public candidate artifact checksums recorded during Phase 0:

| Artifact | URL | License page | SHA-256 |
|---|---|---|---|
| `NoorBayan/Quranic` `corpus/Quran.csv` | https://raw.githubusercontent.com/NoorBayan/Quranic/main/corpus/Quran.csv | GitHub repo MIT for software; Mendeley dataset page CC BY 4.0 for data | `9b0634666225ee386a64350d100c65da05d2180b8af2cec120074b2c030887ee` |
| `NoorBayan/Quranic` `corpus/pos.csv` | https://raw.githubusercontent.com/NoorBayan/Quranic/main/corpus/pos.csv | GitHub repo MIT for software; Mendeley dataset page CC BY 4.0 for data | `83ba9c9ec18279d30efb16c00622cc0a1e6b5ca6e24b1bbd31ae0b1755c03541` |
| `NoorBayan/Quranic` `corpus/RelLabels.csv` | https://raw.githubusercontent.com/NoorBayan/Quranic/main/corpus/RelLabels.csv | GitHub repo MIT for software; Mendeley dataset page CC BY 4.0 for data | `dfd0e9bfd1ceb9b1858c6136f4960a4b9be7fcaeb950716507399928a31b1344` |
| `mustafa0x/quran-morphology` `quran-morphology.txt` | https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/quran-morphology.txt | Fork of QAC v0.4; production use blocked by QAC no-change/permitted-use ambiguity | `742bfac59941b2cb09736d5b7aae694af50792261fb8450cbf6afafcc340645f` |

The public `NoorBayan/Quranic` `Quran.csv` currently appears to be verse/sentence-level text in UTF-16LE, not the complete word-level morphology table described by the dataset page. Do not select it as the morphology source until the exact word/token artifact is obtained and reviewed.

## Permission Outcome

On 2026-07-16 the product owner confirmed that the required permission request was sent and settled, and that the canonical translation/Mushaf data had already been prepared for offline distribution. The correspondence itself is kept outside this repository. The request scope below is retained as the release-record checklist:

QAC/Quran Foundation morphology request must ask for:

- permission to convert QAC v0.4 morphology into a normalized SQLite study pack;
- permission to redistribute that SQLite pack offline inside Android and iOS app builds and hosted updates;
- permission to normalize location keys and derive occurrence indexes/counts without changing canonical annotation values;
- permission to include source/version/license metadata and change notices in the app;
- clarification of GPL/source-delivery obligations for generated SQLite packs.

Quran Foundation content request must ask for:

- permission to bundle or long-term cache contextual word glosses and word audio metadata, if those remain part of the offline MVP;
- exact attribution wording and any deletion/update obligations.

Legal/reviewer decision needed before Phase 1:

- either QAC written permission is attached to this record;
- or an alternate morphology artifact is named with exact files, version, license, attribution text, upstream provenance review, modification rights, offline redistribution rights, and checksums.

## Golden Review Workflow

Roles:

- Primary reviewer: qualified Quranic Arabic / Quranic morphology reviewer.
- Secondary reviewer: required before public release for disputed records.
- Data engineer: prepares deterministic fixtures from the approved source only.
- Product owner: confirms beginner-facing wording does not overclaim grammar or meaning.

Workflow:

1. Reviewer approves or edits the 100-location candidate set below.
2. Data engineer extracts source rows for the approved locations after Phase 0 source rights are complete.
3. Reviewer signs off expected surface, segmentation, POS, structured morphology, lemma/root presence or absence, and any source uncertainty.
4. Disputes are tagged `needs-second-review`; disputed records cannot be used as release-blocking truth until resolved.
5. Phase 1 converts approved records into deterministic fixtures and contract tests.

Sign-off fields to capture before Phase 1:

- reviewer name, affiliation/qualification, date, approved terminology version;
- source artifact/version/checksum reviewed;
- disputed records list;
- required attribution/source wording;
- explicit note that prose i'rab, dictionary definitions, generated conjugation, dependency syntax, and AI-generated canonical analysis are outside the MVP.

## Candidate 100-Word Golden Set

This candidate set was selected from the existing English word-translation pack only to ensure valid `surah:ayah:wordPosition` coordinates and broad coverage. It is not a linguistic approval record.

| # | Location | Word | Gloss | Stratum |
|---:|---|---|---|---|
| 1 | `2:141:11` | وَلَا | And not | particles-prepositions |
| 2 | `3:84:19` | وَٱلنَّبِيُّونَ | and the Prophets | particles-prepositions |
| 3 | `4:144:12` | أَن | that | particles-prepositions |
| 4 | `6:99:16` | مِنْهُ | from it | particles-prepositions |
| 5 | `8:38:13` | فَقَدْ | then verily | particles-prepositions |
| 6 | `11:7:14` | أَيُّكُمْ | which of you | particles-prepositions |
| 7 | `14:40:5` | وَمِن | and from | particles-prepositions |
| 8 | `18:53:9` | عَنْهَا | from it | particles-prepositions |
| 9 | `22:65:17` | أَن | lest | particles-prepositions |
| 10 | `27:23:5` | وَأُوتِيَتْ | and she has been given | particles-prepositions |
| 11 | `33:7:15` | مِنْهُم | from them | particles-prepositions |
| 12 | `38:82:2` | فَبِعِزَّتِكَ | Then by Your might | particles-prepositions |
| 13 | `44:58:1` | فَإِنَّمَا | Indeed | particles-prepositions |
| 14 | `57:11:1` | مَّن | Who (is) | particles-prepositions |
| 15 | `76:11:1` | فَوَقَىٰهُمُ | But will protect them | particles-prepositions |
| 16 | `2:189:19` | ٱتَّقَىٰ ۗ | fears (Allah) | divine-proper-names |
| 17 | `3:99:16` | ٱللَّهُ | Allah | divine-proper-names |
| 18 | `4:119:10` | ٱللَّهِ ۚ | (of) Allah | divine-proper-names |
| 19 | `6:31:6` | ٱللَّهِ ۖ | (with) Allah | divine-proper-names |
| 20 | `9:9:3` | ٱللَّهِ | [with] the Verses of Allah | divine-proper-names |
| 21 | `10:81:10` | ٱللَّهَ | Allah | divine-proper-names |
| 22 | `16:72:1` | وَٱللَّهُ | And Allah | divine-proper-names |
| 23 | `24:21:17` | فَضْلُ | (for the) Grace of Allah | divine-proper-names |
| 24 | `31:11:3` | ٱللَّهِ | (of) Allah | divine-proper-names |
| 25 | `39:32:6` | ٱللَّهِ | Allah | divine-proper-names |
| 26 | `48:6:14` | ٱللَّهُ | and Allah's wrath (is) | divine-proper-names |
| 27 | `62:11:19` | وَٱللَّهُ | And Allah | divine-proper-names |
| 28 | `2:99:7` | يَكْفُرُ | disbelieves | verbs-actions |
| 29 | `3:10:3` | كَفَرُوا۟ | disbelieve[d] | verbs-actions |
| 30 | `4:51:12` | وَيَقُولُونَ | and they say | verbs-actions |
| 31 | `5:72:4` | قَالُوٓا۟ | say | verbs-actions |
| 32 | `6:158:34` | قُلِ | Say | verbs-actions |
| 33 | `8:45:3` | ءَامَنُوٓا۟ | believe | verbs-actions |
| 34 | `10:50:1` | قُلْ | Say | verbs-actions |
| 35 | `12:84:1` | وَتَوَلَّىٰ | And he turned away | verbs-actions |
| 36 | `17:2:1` | وَءَاتَيْنَا | And We gave | verbs-actions |
| 37 | `20:51:1` | قَالَ | He said | verbs-actions |
| 38 | `23:110:4` | أَنسَوْكُمْ | they made you forget | verbs-actions |
| 39 | `27:47:6` | قَالَ | He said | verbs-actions |
| 40 | `31:28:2` | خَلْقُكُمْ | (is) your creation | verbs-actions |
| 41 | `37:29:5` | مُؤْمِنِينَ | believers | verbs-actions |
| 42 | `41:30:12` | تَخَافُوا۟ | fear | verbs-actions |
| 43 | `48:14:5` | يَغْفِرُ | He forgives | verbs-actions |
| 44 | `59:16:4` | قَالَ | he says | verbs-actions |
| 45 | `77:43:2` | وَٱشْرَبُوا۟ | and drink | verbs-actions |
| 46 | `2:226:3` | مِن | from | rootless-short-function |
| 47 | `4:104:6` | إِن | If | rootless-short-function |
| 48 | `7:12:13` | مِن | from | rootless-short-function |
| 49 | `10:61:23` | عَن | from | rootless-short-function |
| 50 | `16:61:19` | لَا | not | rootless-short-function |
| 51 | `22:5:19` | ثُمَّ | then | rootless-short-function |
| 52 | `28:27:25` | إِن | if | rootless-short-function |
| 53 | `37:35:3` | إِذَا | when | rootless-short-function |
| 54 | `47:14:2` | كَانَ | is | rootless-short-function |
| 55 | `70:30:4` | أَوْ | or | rootless-short-function |
| 56 | `2:176:9` | ٱخْتَلَفُوا۟ | who differed | long-attached-forms |
| 57 | `3:190:6` | وَٱخْتِلَـٰفِ | and (in the) alternation | long-attached-forms |
| 58 | `5:89:36` | حَلَفْتُمْ ۚ | you have sworn | long-attached-forms |
| 59 | `7:160:1` | وَقَطَّعْنَـٰهُمُ | And We divided them | long-attached-forms |
| 60 | `10:73:7` | وَجَعَلْنَـٰهُمْ | and We made them | long-attached-forms |
| 61 | `16:36:11` | ٱلطَّـٰغُوتَ ۖ | the false deities | long-attached-forms |
| 62 | `21:38:1` | وَيَقُولُونَ | And they say | long-attached-forms |
| 63 | `26:176:4` | ٱلْمُرْسَلِينَ | the Messengers | long-attached-forms |
| 64 | `33:53:48` | لِقُلُوبِكُمْ | for your hearts | long-attached-forms |
| 65 | `41:20:8` | وَأَبْصَـٰرُهُمْ | and their sight | long-attached-forms |
| 66 | `53:45:3` | ٱلزَّوْجَيْنِ | the pairs | long-attached-forms |
| 67 | `70:40:4` | ٱلْمَشَـٰرِقِ | (of) the risings | long-attached-forms |
| 68 | `3:19:1` | إِنَّ | Indeed | first-word-of-verse |
| 69 | `6:145:1` | قُل | Say | first-word-of-verse |
| 70 | `11:86:1` | بَقِيَّتُ | (What) remains | first-word-of-verse |
| 71 | `18:45:1` | وَٱضْرِبْ | And present | first-word-of-verse |
| 72 | `24:18:1` | وَيُبَيِّنُ | And Allah makes clear | first-word-of-verse |
| 73 | `30:23:1` | وَمِنْ | And among | first-word-of-verse |
| 74 | `38:84:1` | قَالَ | He said | first-word-of-verse |
| 75 | `51:3:1` | فَٱلْجَـٰرِيَـٰتِ | And those sailing | first-word-of-verse |
| 76 | `68:31:1` | قَالُوا۟ | They said | first-word-of-verse |
| 77 | `85:16:1` | فَعَّالٌۭ | Doer | first-word-of-verse |
| 78 | `2:158:13` | جُنَاحَ | blame | middle-word-of-long-verse |
| 79 | `3:159:15` | فَٱعْفُ | Then pardon | middle-word-of-long-verse |
| 80 | `5:36:13` | لِيَفْتَدُوا۟ | to ransom themselves | middle-word-of-long-verse |
| 81 | `7:57:15` | لِبَلَدٍۢ | to a land | middle-word-of-long-verse |
| 82 | `9:108:11` | يَوْمٍ | day | middle-word-of-long-verse |
| 83 | `13:5:14` | كَفَرُوا۟ | disbelieved | middle-word-of-long-verse |
| 84 | `20:72:10` | فَطَرَنَا ۖ | created us | middle-word-of-long-verse |
| 85 | `29:25:15` | ٱلْقِيَـٰمَةِ | (of) the Resurrection | middle-word-of-long-verse |
| 86 | `40:5:11` | بِرَسُولِهِمْ | against their Messenger | middle-word-of-long-verse |
| 87 | `57:29:10` | فَضْلِ | (the) Bounty | middle-word-of-long-verse |
| 88 | `3:97:25` | ٱلْعَـٰلَمِينَ | the universe | last-word-of-verse |
| 89 | `8:9:11` | مُرْدِفِينَ | one after another | last-word-of-verse |
| 90 | `16:48:17` | دَٰخِرُونَ | (are) humble | last-word-of-verse |
| 91 | `23:55:7` | وَبَنِينَ | and children | last-word-of-verse |
| 92 | `32:5:17` | تَعُدُّونَ | you count | last-word-of-verse |
| 93 | `42:16:18` | شَدِيدٌ | severe | last-word-of-verse |
| 94 | `56:89:4` | نَعِيمٍۢ | (of) Pleasure | last-word-of-verse |
| 95 | `82:18:6` | ٱلدِّينِ | (of the) Judgment | last-word-of-verse |
| 96 | `3:93:21` | فَٱتْلُوهَآ | and recite it | whole-quran-spread |
| 97 | `8:44:5` | فِىٓ | in | whole-quran-spread |
| 98 | `18:77:22` | لَتَّخَذْتَ | surely you (could) have taken | whole-quran-spread |
| 99 | `33:27:10` | عَلَىٰ | on | whole-quran-spread |
| 100 | `57:22:17` | إِنَّ | Indeed | whole-quran-spread |

## Open Risks And Blockers

1. The permission correspondence is retained by the product owner outside the repository. Release records should attach or reference it before public distribution.
2. A qualified Quranic Arabic reviewer has not yet signed off the terminology, review workflow, or 100-location golden set. This is a Phase 9A Android public-release requirement and later carries forward to iOS; it is not a Phase 2 compiler blocker.
3. Three QAC-vs-canonical surface-script differences are accepted with the canonical offline word pack authoritative; they are fully recorded in both validation reports and should be included in linguistic review.
4. The Phase 1 rich fixtures remain contract fixtures. Production values come only from the checksummed QAC v0.4 input and canonical offline word payload.

## Verification Log

- 2026-07-16: `npm run verify` passed (`tsc --noEmit`; `node scripts/check-core-purity.js`).
- 2026-07-16 Phase 1: Contract runner passed after compiling the word-study contract slice with `npx tsc --ignoreConfig --target ES2022 --module node16 --moduleResolution node16 --rootDir . --outDir .tmp/word-study-contract ...` and running `node .tmp/word-study-contract/tests/word-study-contract/word-study-contract.test.cjs`.
- 2026-07-16 Phase 1: `npm run verify` passed (`tsc --noEmit`; `node scripts/check-core-purity.js`).
- 2026-07-16 Phase 2 authorization update: product owner confirmed written permission and the existing canonical translation/Mushaf offline rights, superseding the earlier blocked note.
- 2026-07-16 Phase 2 focused tests: `npm run test:word-study-pack` passed 6/6 tests covering golden records, normalization, duplicate detection, missing foreign keys, derived counts, alignment failures, and byte-identical SQLite output.
- 2026-07-16 Phase 2 full build: `npm run compile:word-study-pack` passed with 6,236 ayahs, 77,429 canonical words, 77,429 morphology words, 77,429 aligned rows, 128,219 morphemes, 5,155 lemmas, 1,642 roots, and 77,429 contextual glosses. Three reviewed script variants and zero unresolved exceptions were recorded.
- 2026-07-16 Phase 2 determinism: a second full build was byte-identical; both database files had SHA-256 `f866c0e0502e0a6e668260cdcd7783994773c5119d17ae35157c7e41a87fbdff` and logical SHA-256 `9c730ace19a57a724b3198fd80f3ed75f2e388c203525aaaaf2ee99af6ebc32d`.
- 2026-07-16 Phase 2 final verification: `npm run verify` passed (`tsc --noEmit`, core purity, and 6/6 compiler tests). Syntax checks for both compiler entry points also passed.
- 2026-07-16 Phase 3 focused tests: `npm run test:word-study-repository` passed 12/12 tests against the real pack plus injected lifecycle failure modes.
- 2026-07-16 Phase 3 benchmark: `npm run benchmark:word-study-repository` passed. Final CI-equivalent p95 was 0.111 ms for cache-cold location lookup, 0.514 ms for the first 50 lemma results, and 0.572 ms for the first 50 root results.
- 2026-07-16 Phase 3 final verification: `npm run verify` passed (`tsc --noEmit`, core purity, 6/6 compiler tests, and 12/12 repository/lifecycle tests).
- 2026-07-16 Phase 3 Android verification: `./gradlew :app:compileDebugKotlin` passed and autolinked `expo-crypto` 56.0.4. `NODE_ENV=production npx expo export --platform android --output-dir .artifacts/word-study-expo-export` passed and included the 59 MB bundled SQLite asset.
- 2026-07-17 Phase 4 focused component/view-model tests: `npm run test:word-study-quick-sheet` passed 5/5 tests covering native payload normalization, segmented verb presentation, explicit rootless/missing explanations, source labels, numeric sheet constraints, accessibility loading copy, and required actions.
- 2026-07-17 Phase 4 release timing profile on Android API 36 AVD `quran_api36`: 20 Surah 2 tap samples measured tap-to-sheet-present p95 53.02 ms (37.78-71.12 ms) and tap-to-offline-analysis p95 24.70 ms (18.07-50.44 ms). The first release tap after entering Surah 2 measured 95.07 ms to present and 31.03 ms to resolve.
- 2026-07-17 Phase 4 manual Surah 2 checks: rootless `2:1:1`, active-audio `2:2:1`, and post-long-scroll `2:25:19` all opened the quick sheet with resolved offline content. Active-audio tap measured 96.17/44.25 ms present/resolve; post-scroll tap measured 98.76/41.48 ms. Twelve rapid reader flings retained 28 visible accessible word targets, and the Phase 5 placeholder round-trip restored the same verse-25 reader window.
- 2026-07-17 Phase 4 Android builds: `./gradlew :app:compileDebugKotlin`, `npm run android`, and `npm run perf:android` (release APK) passed.
- 2026-07-17 Phase 4 final verification: `npm run verify` passed (`tsc --noEmit`, core purity, 6/6 compiler tests, 12/12 repository/lifecycle tests, and 5/5 quick-sheet tests).
- 2026-07-17 Phase 5 focused UI/model tests: `npm run test:word-study-screen` passed 5/5 tests covering applicable-only morphology fields, rootless particles, adjacent navigation, source/version attribution, sharing, the RTL ayah ribbon, tabs, and route-driven selection. Quick-sheet coverage now passes 6/6 after adding readable labels for all POS codes present in the installed corpus.
- 2026-07-17 Phase 5 repository coverage: `npm run test:word-study-repository` passed 13/13 tests, including real-pack ayah lookup returning every word in canonical position order.
- 2026-07-17 Phase 5 Android/build verification: `./gradlew :app:compileDebugKotlin` and `./gradlew :app:installDebug` passed; the final production Android Expo export passed and bundled the 59 MB Word Study SQLite asset.
- 2026-07-17 Phase 5 emulator checks on Android API 36: deep links opened `3:3:9` and rootless `2:141:11`; the selected ribbon card stayed visible; switching to `3:3:8` preserved the Morphology tab and rendered its attached pronoun; stack back returned to the prior screen; light/dark themes and system font scales 1.0 and 1.3 rendered without clipping. The emulator font scale and app theme were restored after the check.
- 2026-07-17 Phase 5 final verification: `npm run verify` passed (`tsc --noEmit`, core purity, 6/6 compiler tests, 13/13 repository/lifecycle tests, 6/6 quick-sheet tests, and 5/5 full-screen tests).
- 2026-07-17 Phase 6 focused tests: `npm run test:word-study-screen` passed 8/8 model/UI-source tests and `npm run test:word-study-repository` passed 15/15 real-pack repository/lifecycle tests. Coverage includes named counters, unavailable lemma/root filters, bounded queries, exact reader parameters, stale cancellation, normalized-surface duplicates, ayah context, a 2,851-item root, and golden first/final pages.
- 2026-07-17 Phase 6 large-root benchmark: `npm run benchmark:word-study-repository` passed. The 2,851-occurrence `اله` root returned its first fixed 30-row page at 2.343 ms p95 in the Node 24 / `node:sqlite` CI-equivalent profile; the occurrence gate remains 100 ms.
- 2026-07-17 Phase 6 Android/build verification: `./gradlew :app:compileDebugKotlin` and `./gradlew :app:installDebug` passed on Android API 36 AVD `quran_api36`.
- 2026-07-17 Phase 6 emulator round-trip: root `نزل` showed `1–30 of 293`; opening result `2:4:4` landed on verse 2:4 with word position 4 highlighted. Android Back restored the Occurrences tab, Root filter, first page, and prior study scroll offset.
- 2026-07-17 Phase 6 final verification: `npm run verify` passed (`tsc --noEmit`, core purity, 6/6 compiler tests, 15/15 repository/lifecycle tests, 6/6 quick-sheet tests, and 8/8 full-screen/occurrence tests).
- 2026-07-17 Phase 7 focused parity tests: `npm run test:word-study-quick-sheet` passed 8/8, including identical normalization for Translation, native Tajweed, and Mushaf payloads plus source checks that Surah/Juz/Page use the shared React Native sheet and Kotlin contains no study UI/repository/model.
- 2026-07-17 Phase 7 native range tests: `./gradlew :app:testDebugUnitTest :app:compileDebugKotlin` passed. The three JUnit cases cover multi-glyph words with attached marks, contiguous ranges across potential line boundaries, and safe rejection of incomplete word-to-glyph metadata.
- 2026-07-17 Phase 7 Android build: `./gradlew :app:installDebug` passed and installed the updated APK on Android API 36 AVD `quran_api36`.
- 2026-07-17 Phase 7 emulator matrix: native Surah Tajweed tap `2:2:1` resolved offline analysis; the same exact-Mushaf word `1:2:1` resolved identically from Surah, Juz, and Page; and the same Translation word `1:1:2` resolved identically from Juz and Page. Returning/switching among mounted readers preserved their requested mode without an update loop.
- 2026-07-17 Phase 7 final verification: `npm run verify` passed (`tsc --noEmit`, core purity, 6/6 compiler tests, 15/15 repository/lifecycle tests, 8/8 quick-sheet/parity tests, and 8/8 full-screen/occurrence tests).

## Next Phase

Next phase is **Phase 9A — Android MVP release hardening**. Phase 8 and Phase 9B are intentionally deferred until active iOS development begins.

## Phase 1 Acceptance Status

Source-of-truth web paths mirrored for Phase 1:

- `../quran-app/src/domain/word-study/WordStudy.ts`
- `../quran-app/src/domain/word-study/WordStudyLocation.ts`
- `../quran-app/src/domain/word-study/WordStudyFixtures.ts`
- `../quran-app/src/domain/repositories/IWordStudyRepository.ts`
- `../quran-app/src/application/use-cases/word-study/GetWordAnalysis.ts`
- `../quran-app/src/application/use-cases/word-study/ListWordOccurrences.ts`
- `../quran-app/tests/unit/domain/word-study/WordStudy.contract.test.ts`

Synced mobile paths:

- `src/core/domain/word-study/*`
- `src/core/domain/repositories/IWordStudyRepository.ts`
- `src/core/application/use-cases/word-study/*`
- `tests/word-study-contract/word-study-contract.test.cts`

| Requirement | Status | Record |
|---|---|---|
| Add shared domain models for `WordAnalysis`, `Morpheme`, `MorphologyFeatures`, `Lemma`, `Root`, source attribution, and paginated occurrences | Done | `src/core/domain/word-study/WordStudy.ts`. |
| Add shared repository/use-case interfaces for lookup by location and occurrence queries | Done | `IWordStudyRepository`, `GetWordAnalysis`, and `ListWordOccurrences`. |
| Add strict location parsing/formatting and never join through Quran Foundation numeric word ID | Done | `WordStudyLocation.ts`; tests reject extra `surah:ayah:wordPosition:wordId` keys. |
| Define structured missing/unsupported states for particles, proper nouns, absent roots, absent lemmas, and unavailable licensed layers | Done | `WordStudyField<T>` and contract fixtures cover particle rootless, proper-noun root absent, missing lemma, missing segmentation, and not-yet-reviewed morphology. |
| Convert Phase 0 golden set into deterministic fixtures and contract tests | Done, contract-only | 100 location fixtures are recorded; rich fixtures are explicitly non-production contract fixtures pending Phase 0 rights/reviewer approval. |
| Make shared-core changes in the web repository first, sync them, and document source-of-truth paths | Done | Web paths listed above; synced with `npm run sync:web-core`. |
| Shared core passes purity checks and contains no React Native, Expo, browser, SQLite, or native-platform dependency | Done | `npm run verify` passed and `check-core` passed. |
| Contract tests cover valid/invalid locations, segmented and unsegmented words, rootless words, verbs, and pagination | Done | Web Jest test added; mobile standalone contract runner executed successfully. Web Jest was not run because `../quran-app` dependencies are not installed in this workspace (`jest: command not found`). |
| Models carry source/version identifiers without embedding presentation copy | Done | `WordStudySourceReference` is carried by fields, morphemes, lemma/root records, glosses, and occurrence items. |
| `npm run verify` passes | Done | Passed on 2026-07-16. |

Implementation decisions:

- Kept the repository key as canonical `surah:ayah:wordPosition`; numeric `wordId` is absent from the shared join contract.
- Used discriminated `WordStudyField<T>` wrappers so unsupported, missing, unavailable, and available states cannot be confused by UI/storage code.
- Kept source attribution as identifiers/version/layer in the core models; detailed license display text remains a later UI/content concern.
- Added a one-time source-of-truth repair: pre-existing mobile shared-core download and pack contracts were copied into `../quran-app/src/{domain,application}` before syncing, because the sync script replaces mobile shared core from web.

## Phase 2 Acceptance Status

Phase 2 is a standalone build tool and does not mirror a web UI feature. No `../quran-app` source-of-truth files were changed or mirrored in this phase.

| Requirement | Status | Record |
|---|---|---|
| Deterministic source-to-SQLite compiler using approved artifacts | Done | `scripts/compile-word-study-pack.cjs` and `scripts/word-study-pack/compiler.cjs`; inputs are checksum-gated. |
| Section 7 schema/indexes, source metadata, checksums, compiler version, change notices | Done | Schema version 1 includes all required tables/indexes plus per-row source links and compiler metadata. |
| Validate against canonical app word payload | Done | 6,236/6,236 ayahs and 77,429/77,429 word keys align. |
| Derive surface, lemma, and root counts | Done | Counts are derived from indexed `word_analysis` rows; no GreenTech totals or databases are read. |
| Machine- and human-readable reports | Done | `validation-report.json` and `validation-report.md` are generated beside the pack. |
| Tests for golden fixtures, normalization, duplicates, foreign keys, counts, determinism | Done | Six Node tests pass and are included in `npm run verify`. |
| Byte-identical output or deterministic logical checksum | Done | Two complete builds were byte-identical and the manifest carries both database and logical SHA-256 checksums. |
| Every row traces to source ID/version | Done | Word, morpheme, lemma, root, gloss, and `word_analysis_source` records reference `source_metadata`. |
| No GreenTech APK/database or unlicensed scraping | Done | Compiler accepts only local, checksummed QAC and canonical pack files; it contains no network client. |
| Phase 3 or later work excluded | Done | No mobile repository, lifecycle, download, UI, route, audio, or native reader code was added. |

Implementation decisions:

- The app's offline word pack is authoritative for displayed Uthmani surface and contextual English gloss. QAC remains authoritative for segmentation and structured morphology.
- Original QAC Buckwalter values are converted mechanically to Arabic for storage; annotations are not corrected. Transformations and derived-count behavior are recorded as change notices.
- IDs are assigned after canonical sorting; builds write no timestamps. SQLite page/schema settings are fixed, and a logical checksum supports cross-SQLite-version comparison.
- The generated database is 58,961,920 bytes with SHA-256 `f866c0e0502e0a6e668260cdcd7783994773c5119d17ae35157c7e41a87fbdff`.

Manual checks still required:

- Attach/reference the external permission correspondence in release governance records.
- Have the Quranic Arabic reviewer sign off the terminology/golden set and the three recorded script variants before public release.

## Phase 3 Acceptance Status

Phase 3 is mobile-only infrastructure. It consumes the shared contracts previously mirrored from these exact web source-of-truth files, without changing them in this phase:

- `../quran-app/src/domain/word-study/WordStudy.ts`
- `../quran-app/src/domain/word-study/WordStudyLocation.ts`
- `../quran-app/src/domain/repositories/IWordStudyRepository.ts`
- `../quran-app/src/application/use-cases/word-study/GetWordAnalysis.ts`
- `../quran-app/src/application/use-cases/word-study/ListWordOccurrences.ts`

| Requirement | Status | Record |
|---|---|---|
| Mobile SQLite repository in `src/core/infrastructure` | Done | `SQLiteWordStudyRepository` maps the real schema to shared word, morpheme, morphology, lemma, root, gloss, source, and occurrence contracts. |
| Bundle/install initial pack with existing pack patterns | Done | The Phase 2 database/manifest are Metro assets; app startup installs/verifies them behind the splash screen, while the first repository query retains a safe lazy fallback. |
| Catalog metadata and hosted updates | Done | `dist/word-study-packs/catalog.json`, app catalog configuration, `WordStudyPackCatalogClient`, and staged hosted installation are implemented. Relative catalog URLs resolve against the catalog URL. |
| Schema/version/checksum compatibility | Done | Pack format/schema, file size, SHA-256, SQLite application ID/user version, logical checksum, and `quick_check` are verified before activation. The app adds SDK-compatible `expo-crypto` because the existing filesystem API exposes only MD5. |
| Atomic replacement, rollback, corruption recovery | Done | Version directories are staged outside the active path, directory promotion and activation records use rollback files, interrupted promotions restore the prior generation, and invalid active packs roll back or reinstall bundled content. |
| Small cancellable LRU cache | Done | Word cache capacity is 128; lemma/root capacities are 64 each. Cache misses share in-flight promises, rejected entries are evicted, and concrete repository calls accept `AbortSignal` without changing the shared interface. |
| Lookup and paginated occurrence use cases | Done | Existing Phase 1 use cases are wired to the repository in the container; surface/lemma/root predicates are parameterized, results are Quran-ordered, limits are bounded to 100, and offset cursors are deterministic. |
| Repository integration tests and benchmark harness | Done | Twelve tests use the actual 58,961,920-byte SQLite pack via Node 24 `node:sqlite`; lifecycle failure modes use an injected backend. `scripts/benchmark-word-study-repository.cjs` enforces the Phase 3 p95 gates. |
| Offline cold lookup | Done in CI-equivalent profile | Tests open the local pack read-only with no network path. The repository never fetches content; network access exists only in the explicit hosted-update method. |
| Golden counts and pagination through real repository | Done | `3:3:9` resolves lemma `أَنزَلَ` with 183 occurrences and root `نزل` with 293 occurrences across 12 lemmas; root pagination returns 293 items from `2:4:4` through `97:4:1`. |
| Performance gate | Done in CI-equivalent profile | Node 24 / `node:sqlite`, warm OS file cache and repository LRU cold per lookup: lookup p95 0.111 ms; first 50 lemma p95 0.514 ms; first 50 root p95 0.572 ms. Gates are 50/100 ms. |
| UI/routes/reader changes excluded | Done | No quick sheet, study route, or reader behavior was added. |

Implementation decisions:

- Pack versions are immutable. Updates are fully downloaded and validated before a small activation record switches the active generation; the former generation remains the rollback target.
- SHA-256 verification occurs on every staged bundled/hosted binary before promotion. Startup/recovery rechecks size, manifest compatibility, SQLite identity/schema, logical checksum, and integrity without rehashing 59 MB on every launch. SQLite connections are set to `query_only` so app code cannot mutate the compiled corpus.
- Offset cursors are intentionally opaque strings at the contract boundary. Indexed filtering bounds the candidate set; numeric surah/ayah/position ordering prevents lexicographic Quran ordering errors.
- The repository owns only read/query/cache behavior. Lifecycle installation remains a separate infrastructure boundary, and no Expo/native dependency entered shared domain or application code.

Manual checks still required:

- Repeat the benchmark on representative low/mid-range Android hardware during Phase 9A; repeat it separately on iOS during deferred Phase 9B. The current numbers are the plan-approved CI-equivalent profile.
- Exercise forced process termination during a hosted update on-device when a hosted version newer than the bundled generation is published. Automated tests prove that failed/interrupted installation does not switch the activation record.

## Phase 4 Acceptance Status

Phase 4 is a mobile-only UI/native-reader slice. It consumes, but does not change, the shared contracts mirrored from these exact web source-of-truth files:

- `../quran-app/src/domain/word-study/WordStudy.ts`
- `../quran-app/src/domain/word-study/WordStudyLocation.ts`
- `../quran-app/src/domain/repositories/IWordStudyRepository.ts`
- `../quran-app/src/application/use-cases/word-study/GetWordAnalysis.ts`

The quick-sheet UI itself is intentionally React Native and has no web UI source-of-truth. Existing web audio timing/highlight behavior was consulted through `../quran-app/app/shared/player/hooks/useAudioWordSync.ts` and `../quran-app/app/(features)/surah/components/surah-view/useVerseAudioWordSync.ts`; the primary tap behavior intentionally follows the locked Word Study product contract instead of the web tap-to-seek behavior.

| Requirement | Status | Record |
|---|---|---|
| Normalize the primary Android word press contract | Done | `WordStudyPressEvent` validates and canonicalizes `{ verseKey, wordPosition, wordId?, surfaceText?, source }`; Kotlin emits the small surface/location payload and never bridges morphology. `wordId` remains advisory. |
| Normal tap opens Word Study with explicit audio alternatives | Done | Native plain/word-by-word tokens are always pressable for study. `useVerseAudioWordSync` exposes separate play-word and play-verse-from-word actions; active audio no longer changes the primary tap. |
| Reusable quick sheet with numeric height constraints | Done | `WordQuickSheet` uses numeric `height`, `minHeight`, and `maxHeight` derived from `useWindowDimensions()`, with a scrollable body and shared modal transition. |
| Required study content | Done | Location, segmented Arabic, underline/color plus readable POS legend, contextual gloss, primary POS, lemma, root/absence explanation, current inflection, source label, and explicit audio actions render from shared models. |
| Loading and failure states | Done | Optimistic surface skeleton, missing-analysis explanation, repository error, and retry are implemented. Stale results are ignored after close or a newer tap. |
| Reader selection/position restoration | Done | The tapped native word is selected while the sheet is open, audio highlight resumes after close, and modal/placeholder round-trips do not remount or reposition the RecyclerView. |
| Accessibility baseline | Done | Native word targets expose Uthmani text, word translation, and `Open Word Study`; sheet close/actions/states are labeled, and each segment announces its Arabic, POS, and morphology instead of relying on color. |
| Full-study action | Done as Phase 4 handoff | The exact `/study/word/[surah]/[ayah]/[position]` route was introduced as a placeholder in Phase 4 and is now implemented by Phase 5. |
| Presentation/lookup performance | Done on release AVD | 20 Surah 2 samples: present p95 53.02 ms and offline result p95 24.70 ms. First release tap: 95.07/31.03 ms. Runtime instrumentation logs both metrics per tap. |
| Long-Surah and active-audio regression checks | Done on release AVD | Twelve rapid Surah 2 flings retained 28 visible accessible word targets. With verse audio active, tapping `2:2:1` opened study in 96.17/44.25 ms rather than seeking implicitly. |
| Component tests, verification, and Android build | Done | Five quick-sheet tests pass; repository coverage includes particle versus non-particle root absence; `npm run verify`, debug Kotlin compile, debug APK, and release APK pass. |
| Scope exclusions | Done | No complete full study screen, occurrence list, Tajweed hit-testing, Mushaf word integration, iOS parity, prose i'rab, or dictionary layer was added. |

Implementation decisions:

- The sheet shell is committed before the query begins, keeping modal presentation independent from first-open SQLite work while still resolving from the bundled pack immediately after tap.
- Primary Android plain mode continues using the already-mounted token layout; Phase 4 only changes clickability and the small event. Long-Surah payload size and morphology query count are unchanged.
- Exact word playback uses existing QDC segment timing and pauses at the selected segment end. `Play verse from here` uses the same timing index without installing a second audio stack.
- Root absence now distinguishes known particles (`particle-has-no-root`) from other non-root-bearing categories (`not-applicable`), preventing pronouns from being described as particles.

Manual checks still required:

- Repeat performance/accessibility checks on representative low/mid-range physical Android hardware during Phase 9A; Phase 4 was verified on the API 36 release AVD.
- Quranic Arabic terminology and the golden review set still require qualified reviewer sign-off before public release.

## Phase 5 Acceptance Status

Phase 5 extends these exact shared web source-of-truth files first, then syncs them with `npm run sync:web-core`:

- `../quran-app/src/domain/word-study/WordStudy.ts`
- `../quran-app/src/domain/word-study/WordStudyLocation.ts`
- `../quran-app/src/domain/repositories/IWordStudyRepository.ts`
- `../quran-app/src/application/use-cases/word-study/GetVerseWordAnalyses.ts`
- `../quran-app/src/application/use-cases/word-study/index.ts`
- `../quran-app/tests/unit/domain/word-study/WordStudy.contract.test.ts`

There is no existing web full Word Study screen to mirror. The React Native presentation follows `docs/word-study-feature-plan.md` and reuses the Phase 4 mobile segmented-word and source-label patterns.

| Requirement | Status | Record |
|---|---|---|
| Full study route | Done | `/study/word/[surah]/[ayah]/[position]` validates deep-link parameters, resolves the installed study pack offline, and retains normal stack back behavior. |
| Ayah ribbon and selected-word state | Done | `findByVerse`/`GetVerseWordAnalyses` returns the complete ayah ordered by canonical word position. The RTL horizontal ribbon highlights the route-selected word; selecting a ribbon or adjacent item updates only the `position` route parameter. |
| Overview | Done | Contextual gloss, surface form, lemma, root or explicit absence reason, and primary POS are presented as distinct concepts with beginner explanations and Arabic technical terms. |
| Morphology | Done | Prefix/stem/suffix/whole-word cards show segment role, POS code plus readable label, and only source-recorded case/mood/voice/person/gender/number/aspect/state/form/derivation fields. |
| Applicable fields only | Done | Particles, pronouns, nouns, and verbs omit unrecorded feature rows. Rootless particles and missing analyses show explicit explanations instead of blank values. |
| Source/version/about-analysis | Done | The Overview includes grouped layer names, source titles, versions, attribution, an external QAC source link, and an explanation of the structured-analysis scope. |
| Share attribution | Done | The system share sheet includes location, Arabic surface, contextual gloss, applicable lemma/root, and source titles/versions. |
| Reader return and study state | Done by navigation design | Opening the route is a normal stack push over the mounted reader. Ribbon changes use `setParams`, preserving the selected tab and avoiding extra history entries; back returns to the same reader instance/position. |
| Theme, RTL, and font scaling | Done in implementation | All colors use the app light/dark palette, Arabic text has independent RTL direction, ribbon order is inverted for Quran reading order, and text/card layouts use minimum or content-driven heights without disabling font scaling. |
| UI/repository tests | Done | Five focused screen/model tests and thirteen real-pack repository/lifecycle tests pass and are included in `npm run verify`. |
| Scope exclusions | Done | No occurrence results, prose i‘rab, dictionary definitions, saved-word learning, verb paradigms, or additional reader modes were added. |

Implementation decisions:

- Ayah lookup was added to the shared storage-neutral repository contract instead of deriving word counts in the UI or reaching into SQLite from the route.
- The reusable `WordSegmentsCard` keeps quick-sheet and full-screen segment color, underline, readable labels, and accessibility announcements consistent.
- Word selection remains route-driven so deep links, ribbon selection, and adjacent buttons share one canonical state. `setParams` preserves the current Overview/Morphology tab and the underlying reader stack entry.
- The source presentation is deliberately bounded to the two installed Phase 2 sources. It does not imply that beginner UI copy is a new canonical grammar source.

Manual checks required to complete Phase 9A Android release hardening:

- Repeat TalkBack and Android system font-scale checks on representative physical Android devices, including narrow screens and the largest system font size. VoiceOver/Dynamic Type checks are deferred to Phase 9B.
- Obtain the outstanding qualified Quranic Arabic reviewer sign-off for terminology and the golden review set.

## Phase 6 Acceptance Status

Phase 6 has no existing web UI to mirror. It extends these exact shared web source-of-truth files first and syncs them with `npm run sync:web-core`:

- `../quran-app/src/domain/word-study/WordStudy.ts`
- `../quran-app/src/domain/word-study/WordStudyFixtures.ts`

It consumes the existing shared contracts in:

- `../quran-app/src/domain/repositories/IWordStudyRepository.ts`
- `../quran-app/src/application/use-cases/word-study/ListWordOccurrences.ts`

The React Native explorer and reader round-trip follow `docs/word-study-feature-plan.md` and reuse the Phase 5 full-study route plus the primary Android Surah reader.

| Requirement | Status | Record |
|---|---|---|
| Unambiguous counters | Done | The UI names `Normalized surface occurrences`, `Lemma occurrences`, `Root occurrences`, and `Distinct lemmas in this root family`; unavailable lemma/root counters are omitted instead of shown as zero. |
| Surface/Lemma/Root filters | Done | Availability-aware tabs build parameterized indexed repository queries. Rootless or lemma-less words keep disabled filters with accessible explanations. |
| Indexed, paginated, memory-bounded results | Done | Filtering uses the existing normalized-surface, lemma, and root indexes. The UI uses previous/next fixed 30-row pages and never accumulates a full large root in component state. |
| Result content | Done | Every row shows canonical location, exact Uthmani surface, contextual English gloss or an explicit unavailable fallback, and up to two lines of batched Uthmani ayah context. |
| Ayah context without pack mutation | Done | The repository batches verse surfaces for only the current page and assembles context in memory. The immutable Phase 2 SQLite asset, manifest, schema, and checksums remain unchanged. |
| Reader navigation | Done | A result pushes `/surah/[surahId]` in translation mode with exact surah, ayah, and word position; the primary Android native reader lands on the verse and highlights that word. |
| Study and reader restoration | Done | The study route remains mounted below the targeted reader. Back restores the Occurrences tab, selected filter, cursor history/current page, and captured scroll offset; leaving study then reveals the original reader instance at its prior position. |
| Large roots | Done | Real-pack tests cover root `اله` with 2,851 occurrences using first/final 30-row pages. CI-equivalent first-page p95 is 2.343 ms against the 100 ms gate. |
| Duplicate normalized surfaces | Done | Surface queries intentionally group normalized variants while each row retains and renders its exact Uthmani form; the 2,763-item normalized `من` family is covered through first/final golden pages. |
| Missing glosses | Done | Result presentation uses an explicit `Contextual gloss unavailable.` fallback rather than a blank value. |
| Cancelled/stale queries | Done | Each filter/page request has an `AbortController` and monotonically increasing request ID; aborted or out-of-order responses cannot replace current state. |
| Query/UI tests and build | Done | 15/15 repository/lifecycle tests, 8/8 full-screen/occurrence tests, `npm run verify`, Kotlin compilation, debug APK installation, and the emulator round-trip pass. |
| Scope exclusions | Done | No saved-word review, dictionary definitions, dependency trees, prose grammar/i‘rab packs, or additional reader-mode entry points were added. |

Implementation decisions:

- Page-at-a-time navigation is deliberate: it provides deterministic first/last pages and stable memory use for roots with thousands of results.
- `ayahContextUthmani` was added to the storage-neutral occurrence contract. It is assembled from already licensed canonical surfaces and does not introduce a new content source.
- The targeted reader is pushed rather than replacing study or mutating the original reader route. This makes round-trip restoration a stack invariant instead of a reconstructed approximation.
- The occurrence target highlight reuses the native reader’s existing active-word presentation; no morphology or occurrence data crosses the React Native bridge.

Manual checks required during Phase 9A:

- Repeat large-root scrolling, TalkBack, largest Android font scale, low-memory, and rapid filter/page switching checks on representative physical Android devices. Equivalent iOS checks are deferred to Phase 9B.
- Obtain the outstanding qualified Quranic Arabic reviewer sign-off for terminology and the golden review set.

## Phase 7 Acceptance Status

Phase 7 mirrors the existing reader composition and word-payload behavior in these exact web source-of-truth files:

- `../quran-app/app/(features)/surah/components/surah-view/MushafMain.tsx`
- `../quran-app/app/(features)/surah/components/surah-view/MushafWordText.tsx`
- `../quran-app/app/(features)/juz/[juzId]/JuzClient.tsx`
- `../quran-app/app/(features)/page/[pageId]/PageClient.tsx`

There is still no web Word Study presentation to duplicate. The Android readers normalize their existing word payloads into the Phase 1 shared contract, then reuse the Phase 4 React Native controller/sheet and Phase 5/6 full-study route.

| Requirement | Status | Record |
|---|---|---|
| Every existing Android reader mode | Done | Surah native plain, word-by-word, and Tajweed; Juz/Page Translation; and Surah/Juz/Page exact Mushaf all open the same sheet and full route. Juz/Page obtain bundled canonical word metadata when translation responses or offline rows omit `words`. |
| Accurate native Tajweed touch ranges | Done | Kotlin aligns each ordered QCF `codeV2` word with its exact UTF-16 glyph range, applies one clickable span per lexical word, preserves multi-glyph attached marks and line wrapping, and renders the verse-end marker without making it tappable. Incomplete metadata safely falls back to the existing plain rendering. |
| Shared cross-reader event contract | Done | Translation, native Tajweed, and WebView Mushaf payloads normalize to `surah:ayah:wordPosition`; optional numeric IDs and surface text remain advisory. The same canonical location therefore queries the same offline analysis. |
| One study presentation | Done | `ReaderWordStudySheet` is the shared adapter for Surah/Juz/Page. Kotlin contains only rendering, word-range hit testing, and event emission—no quick sheet, full screen, repository, or linguistic model. |
| Preserve reader behavior | Done | Selection guards prevent Mushaf taps from replacing active text selection; selected-word highlighting, explicit word/verse audio actions, target landing, list/page position, Tajweed styling, and reader return behavior remain intact. Reading-mode persistence now updates only from the focused Surah/Juz route so stacked readers do not fight over settings. |
| Parity and edge-case tests | Done | The 8/8 quick-sheet suite proves all payload sources normalize to the same `3:3:9` analysis location and checks shared ownership. Three Android JUnit cases cover attached/multi-glyph marks, contiguous line-boundary ranges, and metadata mismatch fallback. |
| Verification and manual matrix | Done | `npm run verify`, `:app:testDebugUnitTest`, `:app:compileDebugKotlin`, and `:app:installDebug` pass. API 36 emulator taps confirmed canonical equality across native Tajweed, Juz/Page Translation, and Surah/Juz/Page exact Mushaf. |
| Scope exclusions | Done | No new reader mode, iOS native reader, learning tool, or new production dependency was added. JUnit 4 is test-only for the new pure Kotlin range tests. |

Manual checks required during Phase 9A:

- Repeat the reader-mode matrix with TalkBack and largest font scale on representative physical Android devices, including long wrapped Tajweed verses and active audio.
- Obtain the outstanding qualified Quranic Arabic reviewer sign-off for terminology and the golden review set.

## Phase 9A - Android MVP Release Hardening

Release status: **blocked after automated pass**. Android Phase 9A repository-side checks passed on 2026-07-17, but the Android MVP cannot be approved until external Quranic Arabic review and physical Android device checks are complete on a production-signed artifact. Deferred iOS Phase 8 is not a blocker.

Source-of-truth files checked for the partial Phase 9A record:

- `docs/word-study-feature-plan.md`
- `docs/word-study-progress.md`
- `docs/word-study-release-notes.md`
- `docs/word-study-android-physical-device-checklist.md`
- `docs/components.md`
- `docs/archive/web-parity-history.md` (historical migration record)
- `app/privacy.tsx`
- `dist/word-study-packs/qac-v0.4/manifest.json`
- `dist/word-study-packs/qac-v0.4/validation-report.json`

| Hardening item | Status | Record |
|---|---|---|
| Phase 0-7 acceptance criteria remain green | Done in current automated record | `npm run verify` passed on 2026-07-17 after the Phase 9A updates. Deferred Phase 8 is outside the Android gate. |
| English/Arabic copy review | Blocked | Copy exists for quick sheet, full study, source labels, release notes, and privacy notice. No reviewer sign-off record is present. |
| Quranic Arabic golden-set and production-sample review | Blocked | The 100-location candidate set and deterministic fixtures exist, but no qualified Quranic Arabic reviewer name, date, approval, or dispute-resolution record is captured. |
| Android accessibility matrix: TalkBack, RTL, system font scaling, reduced motion, contrast, non-color POS | Blocked | Automated/source coverage includes non-color POS labels and explicit accessibility labels, but physical-device TalkBack and largest-font checks remain required. VoiceOver/Dynamic Type belong to deferred Phase 9B. |
| Stress matrix: long Surah, large root, low memory, offline, corrupt pack, update/rollback, active audio, rapid taps | Partial | Repository tests cover corrupt/invalid lifecycle states, rollback behavior, bounded large-root occurrence queries, stale cancellation, and real-pack integrity. `npm run benchmark:word-study-repository` passed the large-root/lookup thresholds. Physical-device long-Surah, low-memory, active-audio, offline, rapid-tap, and release-build stress runs remain required. |
| Source notices, licenses, attribution, versions, checksums, corrections/change notices | Partial | Source metadata is embedded in the pack manifest and surfaced in Word Study. `docs/word-study-release-notes.md` records pack versions/checksums and excluded future layers. Public release still requires attaching or referencing the out-of-repo written permission correspondence and reviewer approval. |
| Privacy behavior | Done for code/docs | `app/privacy.tsx` names offline resources and Word Study pack state as local data, and states that no analytics tracks studied words, reading content, notes, or religious-profile data. Source search found no analytics dependency/path for Word Study. |
| Product/component/release documentation | Done for blocked RC | `docs/word-study-release-notes.md`, `docs/word-study-android-physical-device-checklist.md`, `docs/components.md`, the archived migration record, and this progress section record the current scope and blockers. |
| Android release build | Done locally, production-signing caveat | `./gradlew :app:testDebugUnitTest :app:compileReleaseKotlin :app:assembleRelease` passed on 2026-07-17. APK `android/app/build/outputs/apk/release/app-release.apk`, SHA-256 `bb99ccba899aba485c686289e28295b45e3a5a4d92255aa6022ee1078c6930aa`, size 132 MB. The repository signs release with the debug keystore, so production-signed verification remains required before public distribution. |
| iOS release build | Deferred, not an Android blocker | This belongs to deferred Phase 8 and Phase 9B. This checkout has no `ios/` directory. |
| `npm run verify` | Done | Passed on 2026-07-17 after the Phase 9A updates: type-check, core purity, Word Study pack tests, repository tests, quick-sheet tests, and screen tests were all green. |
| Repository performance benchmark | Done | `npm run benchmark:word-study-repository` passed on 2026-07-17. P95: lookup 0.504 ms, first 50 lemma 4.719 ms, first 50 root 4.468 ms, first 30 large-root 9.943 ms; thresholds are 50 ms lookup and 100 ms occurrence. |

Release source versions/checksums:

| Artifact | Version | Checksum / size |
|---|---|---|
| Word Study SQLite format | `quran-word-study-sqlite-v1`, schema 1 | database SHA-256 `f866c0e0502e0a6e668260cdcd7783994773c5119d17ae35157c7e41a87fbdff`; 58,961,920 bytes |
| Word Study logical pack | compiler 1.0.0, schema 1 | logical SHA-256 `9c730ace19a57a724b3198fd80f3ed75f2e388c203525aaaaf2ee99af6ebc32d` |
| Quranic Arabic Corpus morphology | v0.4 | source SHA-256 `a1d12923815341face765083805d2148ed2d9f5cc3f7d6665219d887675d8c46` |
| Quran App offline English word pack | 2026-07-04 | source SHA-256 `38975bff99637665869e8231d1d5824b1bc4db4c6cd3b6358b8231d4e882b6f3` |

Known non-blocking limitations once the blocking sign-offs pass:

- Prose i'rab, dictionary definitions, verb paradigms, dependency graphs, saved words, lessons, quizzes, and AI explanations remain post-MVP phases.
- Word audio is a runtime action, not a bundled offline Word Study data layer.
- The MVP presents sourced structured morphology and occurrence indexes; it does not infer or generate canonical grammar prose.

Blocking next steps:

1. Capture qualified Quranic Arabic reviewer sign-off for terminology, the full golden set, and sampled production records; use a second reviewer for any disputed items.
2. Configure production signing or produce the intended store artifact.
3. Run `docs/word-study-android-physical-device-checklist.md` against the production-signed artifact and attach device/tester results.

Deferred iOS sequence:

1. Resume Phase 8 when active iOS development begins.
2. Run Phase 9B immediately before the iOS public release.

## Phase 10 - Arabic Grammar Pack

Implementation status: **repository implementation complete; public distribution blocked by permission and scholarly review**.

| Requirement | Status | Record |
|---|---|---|
| Shared platform-neutral contract | Done | Added verse grammar, ordered passage, review-status, unavailable-state, repository, and use-case contracts in `../quran-app` first, then synced mobile core. |
| Separate offline pack | Done | `quran-word-grammar-sqlite-v1`, schema 1, 5,785 covered ayahs and 29,881 ordered Arabic passages. |
| Deterministic compiler | Done | `npm run compile:word-grammar-pack` parses the pinned StarDict source, removes presentation markup, maps canonical verse keys, preserves prose/order, and emits SQLite plus a manifest. |
| Mobile repository | Done | The read-only Expo SQLite provider opens lazily; the repository queries only by canonical `surah:ayah` and returns structured missing/unavailable states. |
| Professional Grammar view | Done | Four-tab Word Study layout, concise Arabic hero, selected-word/segment passage priority, collapsed long prose, and expandable complete-ayah analysis. Grammar pack provenance is available from the dedicated Word Study Sources destination. |
| No generated canonical prose | Done | Runtime matching changes presentation only. Source Arabic is stored and rendered without LLM generation or editorial rewriting. |
| Source permission | Blocked | Product owner directed implementation before permission. Permission must be recorded before public distribution. |
| Qualified Quranic Arabic review | Blocked | The imported prose and selected-word matching require reviewer sign-off and disputed-record handling before public distribution. |

Phase 10 generated artifact:

| Artifact | Value |
|---|---|
| Source archive SHA-256 | `804b7397d1a239cdeace01b3ea9a656342062f582350c52930b0481dbd3300fb` |
| Database SHA-256 | `34fc38dca6b71708acbb4c3dcf685d639fd25febcda3624ea1404a8caa4cf3d6` |
| Logical SHA-256 | `69ca1d15d697703c218be8a2899ebefb323c0638bd8af8110b275e8e8839fe11` |
| Database size | 15,876,096 bytes |

Phase 10 remains a separate grammar layer and does not supply dictionary or verb-reference content.

## Phase 11A - Downloadable Dictionary Packs

Implementation status: **complete; optional artifacts are not bundled with the app**.

| Requirement | Status | Record |
|---|---|---|
| Shared contracts | Done | Dictionary source, entry summary/detail, lookup result, repository, and use-case contracts were added in `../quran-app` first and synced to mobile. |
| Separate optional packs | Done | `lane-en` and `hans-wehr-en` use `quran-word-reference-sqlite-v1`; neither is imported as an Expo asset. |
| Deterministic compiler | Done | The compiler uses the Core Word Study roots/lemmas, retains matching source families, sanitizes presentation markup, emits unmatched coverage reports, and produces byte-identical output for identical fixtures. |
| Multi-pack lifecycle | Done | Independent install/update/delete, staging, storage preflight, progress/cancel, SHA-256/schema/integrity validation, atomic activation, previous-generation rollback, and immutable versions are implemented. |
| Repository | Done | Installed-source listing, cancellable lemma/root lookup, root-family fallback, lazy entry loading, and database closing before deletion are implemented. |
| Dictionary UI | Done | The fourth horizontally scrollable tab shows install/offline/error states, Lane/Hans source chips, exact lemma entries, collapsed root families, lazy bodies, and source/version attribution. |
| Downloads integration | Done | `word-reference-pack` resources appear under Word Study References with measured file sizes, cancellation, deletion, and reinstall support. |
| Phase 11B separation | Done | No principal parts are extracted or generated from dictionary prose. |

Generated artifacts:

| Pack | Entries | Roots | Lemmas | Database size | Database SHA-256 |
|---|---:|---:|---:|---:|---|
| Lane 3.1.3 | 29,778 | 1,444 | 2,596 | 29,671,424 | `5c9e58e8771b392b82ae7faea390f328d1e6635c785980bb6a4623fbdebb34b2` |
| Hans Wehr 2.14.01 | 13,980 | 1,354 | 2,347 | 4,861,952 | `88c4df1da38633874ed6be1b520346a562e0a76077fced2e3a10e8a0cfb04e59` |

## Full-screen redesign Phases 1–3

Implementation status on 2026-07-18: **complete; Phase 4 language integration and final device hardening remain pending**.

| Requirement | Status | Record |
|---|---|---|
| Full ayah selector | Done | The unboxed wrapping ayah selector replaces the ribbon and visible adjacent navigation while keeping route-driven selection, reduced-motion behavior, and selected-word visibility in collapsed long ayahs. |
| Morphology-first structure | Done | Overview is removed. Contextual meaning and compact lemma/root facts lead the default Morphology tab, followed by segment-specific POS and unique sourced features. |
| Morphology terminology guide | Done | `MorphologyGuideSheet` is a scrollable, accessible bottom sheet with numeric height constraints, back/overlay/close dismissal, segment definitions, feature definitions, Arabic terms, and compact examples. |
| Source relocation | Done | The in-flow About card is removed. Settings links to `Word Study Sources`, which reads active core and installed dictionary manifests plus the bundled grammar manifest for source/version/rights/checksum/link presentation and records methodology boundaries. |
| Attribution retention | Done | Dictionary definitions retain source citations and Word Study sharing retains source titles and versions. |
| Automated coverage | Done | Focused tests cover the four-tab order, unique segment features, guide content/layout constraints, About-card removal, manifest-backed source rendering, Settings navigation, dictionary citations, and attributed sharing. |
