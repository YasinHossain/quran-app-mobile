# Word Study Android MVP Release Notes

Status: Android automated release-candidate checks passed locally, but Android MVP approval remains blocked. Phase 8 iOS parity is intentionally deferred and does not block Android. Phase 9A still requires qualified Quranic Arabic review and the Android physical-device accessibility/stress matrix on the production-signed artifact.

## Included MVP Scope

- Core Word Study Essentials is an explicit user download and is not bundled with the app.
- Canonical word key: `surah:ayah:wordPosition`.
- One shared React Native quick sheet and full study route across implemented reader entry points.
- Segmented Arabic word display with POS labels that do not rely on color alone.
- Overview, Morphology, and Occurrences views with explicit Surface, Lemma, and Root scope handling.
- Post-MVP Phase 10 Arabic Grammar view with selected-word passage priority and expandable complete-ayah i'rab.
- Source/version display and attributed sharing.
- Explicit word audio and verse-from-word playback actions, without overloading normal word taps.

## Data Sources

| Layer | Source | Version | Checksum |
| --- | --- | --- | --- |
| Morphology, segmentation, POS, features, lemma, root | Quranic Arabic Corpus morphology | 0.4 | `a1d12923815341face765083805d2148ed2d9f5cc3f7d6665219d887675d8c46` |
| Canonical surface text | Quran App canonical word dataset | 2026-07-04 | `38975bff99637665869e8231d1d5824b1bc4db4c6cd3b6358b8231d4e882b6f3` |
| Contextual meanings | Independently installed word-by-word language pack (English, Bangla, or another supported language) | selected pack version | selected pack checksum |
| Generated SQLite database | `dist/word-study-packs/qac-v0.4/quran-word-study.db` | schema 3 | `a78130b1ae5c9e4cc64c34232dcc4fa652963151d1ab567200ad0e1a77d08dbc` |
| Generated logical pack | deterministic compiler output | schema 3 | `a384f0c7cb3fea90b0e26691ccb94ecf16fee5d4ac2afcf0092c29bff28002c0` |
| Arabic i'rab prose | Quranic Arabic Corpus i'rab via `zeeyado/quran-ebook` grammar artifact | 1.4 | `804b7397d1a239cdeace01b3ea9a656342062f582350c52930b0481dbd3300fb` |
| Generated grammar SQLite database | `dist/word-grammar-packs/qac-irab-v1.4/quran-word-grammar.db` | schema 1 | `34fc38dca6b71708acbb4c3dcf685d639fd25febcda3624ea1404a8caa4cf3d6` |

The language-neutral Essentials database is 27,549,696 bytes (26.3 MiB) and contains all 77,429 aligned word records, morphology, roots, lemmas, and occurrence indexes from 6,236 ayahs. It contains no contextual meaning table. Meanings work offline after the user separately installs the selected word-by-word language pack.

## Privacy

Word Study runs from the local SQLite pack. The app has no approved analytics path for this feature, so no Word Study analytics are added. Do not send studied words, reading content, notes, or religious-profile data to analytics, logs, or remote services.

## Android Release-Candidate Build

- Local build command: `./gradlew :app:testDebugUnitTest :app:compileReleaseKotlin :app:assembleRelease`
- Local build result on 2026-07-17: passed.
- APK: `android/app/build/outputs/apk/release/app-release.apk`
- APK SHA-256: `bb99ccba899aba485c686289e28295b45e3a5a4d92255aa6022ee1078c6930aa`
- APK size: 132 MB
- Version: `1.0.0`, version code `1`, application ID `com.anonymous.quranappmobile`
- Signing caveat: this repository currently signs the `release` build with the debug keystore. A production-signed artifact must repeat the Android physical-device matrix before public distribution.

## Known Blocking Items

- A qualified Quranic Arabic reviewer has not signed off the complete golden set, terminology, or sampled production records.
- A second reviewer has not resolved disputed items because no primary review record exists yet.
- TalkBack, RTL, largest Android font scale, contrast, reduced-motion, offline/corrupt-pack/update/rollback, active-audio, rapid-tap, long-Surah, large-root, low-memory, and release-build matrices still need physical Android-device sign-off.
- Production signing is not configured in this repository; the current release APK is a local debug-signed release variant.
- Phase 10 grammar-source distribution permission and qualified Arabic review are not yet recorded.

## Deferred iOS Work

- Phase 8 iOS/cross-platform parity and Phase 9B iOS release hardening are intentionally deferred until active iOS development begins.
- This checkout has no `ios/` native project to build.
- VoiceOver, Dynamic Type, safe-area, iOS modal/audio/deep-link behavior, physical-device stress checks, and the iOS release build belong to those deferred phases and do not block the Android MVP.

## Non-Blocking Limitations After Sign-Off

- Dictionary definitions, verb paradigms, dependency graphs, saved words, lessons, quizzes, and AI study explanations remain excluded.
- Word audio remains a runtime action and is not part of the downloaded offline Word Study pack.
- Grammar prose is source-provided and stored separately; the app does not infer or generate canonical grammar prose.

## Word meaning languages

The reader's **Word-by-word language** setting also controls contextual meanings in the quick word-study sheet and full word study. Selecting a language without an installed pack opens a **Download and use** prompt with its download size. The current language remains active during download; successful installation selects the requested language unless the user has since chosen another one. Cancelled or failed downloads do not change the selection. Installed languages switch immediately and work offline.

Arabic text, morphology, and source dictionary entries retain their original content. English, Bangla, and every other supported word language use the same word-translation-pack path, matched by ayah and word position. If the selected pack has no usable value, the app may show English only when the separate English word pack is installed; otherwise it clearly reports that the meaning is unavailable offline. Open word-study views refresh their meanings when a relevant pack is installed or removed.
