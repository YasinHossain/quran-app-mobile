# Word Study Android Physical Device Checklist

Status: required before Android MVP approval. This checklist is the manual Phase 9A matrix; automated tests and the local release APK do not replace it.

## Release Candidate

- Build artifact: `android/app/build/outputs/apk/release/app-release.apk`
- Variant: Android `release`
- App ID: `com.anonymous.quranappmobile`
- Version: `1.0.0` / version code `1`
- APK SHA-256 from the 2026-07-17 local build: `bb99ccba899aba485c686289e28295b45e3a5a4d92255aa6022ee1078c6930aa`
- APK size from the 2026-07-17 local build: 132 MB
- Signing caveat: current Gradle config signs `release` with the debug keystore. Run the same matrix again on the production-signed artifact before public distribution.

## Devices

Record tester, date, device model, Android version, screen size, font scale, display size, theme, network state, and app build SHA/checksum for each run.

Minimum device set:

- Low-end or memory-constrained Android phone.
- Mid-range Android phone.
- Narrow/small-screen Android phone or emulator-backed equivalent if no physical device exists.
- One Android 15/16 device with target SDK 36 behavior.

## Reviewer Sign-Off

- Quranic Arabic reviewer name, qualification/affiliation, date, and signature.
- Confirmation that the complete 100-location golden set was reviewed.
- Confirmation that sampled production records were reviewed across verbs, nouns, proper nouns, particles/rootless words, long words, and high-frequency roots.
- Second reviewer name/date for every disputed item, or a statement that no disputes remain.

## Accessibility

For each device:

- Enable TalkBack and open Word Study from Surah Translation, Surah word-by-word, Surah Tajweed, Juz Translation, Juz Mushaf, Page Translation, and Page Mushaf.
- Confirm each tappable word target announces the Arabic word or useful context plus `Open Word Study`.
- Confirm segmented word announcements include Arabic segment, readable POS label, and morphology summary.
- Confirm POS is understandable without color.
- Set Android font size to largest and display size to largest; verify quick sheet, full study tabs, full-ayah selector, contextual meaning/fallback label, morphology cards, occurrence rows, actions, terminology guide, and Word Study Sources do not clip or overlap.
- Switch app theme light/dark and confirm contrast for text, chips, segment underlines, selected words, and disabled/unavailable states.
- Enable reduce/remove animations where available and confirm sheet/route transitions remain usable.
- Confirm RTL Arabic text remains correctly ordered inside English UI.

## Stress And Navigation

For each device:

- Long Surah: open Al-Baqarah, jump near the middle and end, tap words repeatedly, return from full Word Study, and confirm reader position is preserved.
- Large root: open a high-count root occurrence list, page forward/back repeatedly, switch Surface/Lemma/Root filters, and return to the reader from a result.
- Rapid taps: tap multiple adjacent words quickly; confirm stale lookups do not replace the final selected word.
- Active audio: play a verse, open Word Study, use play word and play verse from here, close the sheet, and confirm normal word taps still open study.
- Offline: launch with network disabled, open bundled Word Study data, and confirm no network is required for analysis or occurrences.
- Corrupt/update/rollback: install a known-good pack, attempt an invalid/corrupt staged pack, and confirm the active pack remains valid.
- Low memory: background/foreground the app during Word Study, occurrence paging, and audio playback; confirm no crash or lost reader state.
- Deep link: open `/study/word/3/3/9`, share copy, navigate to an occurrence, and return to the original reader context.

## Source, License, And Privacy

- Confirm Word Study source/version details are reachable through Settings → Word Study Sources.
- Confirm the Privacy Policy names local Word Study pack state and no analytics tracking of studied words, reading content, notes, or religious-profile data.
- Confirm no analytics/logging event includes the studied word, verse text, notes, reading profile, or religious-profile inference.
- Confirm source notices/checksums in `docs/word-study-release-notes.md` match the shipped pack manifest.

## Result

Android Phase 9A can be marked complete only when:

- All checklist rows pass or have non-critical documented exceptions.
- The production-signed Android artifact passes the same matrix.
- The qualified reviewer sign-off is attached to the release record.
- `npm run verify`, `npm run benchmark:word-study-repository`, and Android release build checks pass on the final source state.

## Full-screen Redesign Phase 4 Audit — 2026-07-18

Automated/source checks completed:

- Selected installed word-language resolution is exact by `language_code`, canonical verse key, and word position; it does not coalesce silently to another language or call the network.
- Missing, malformed, or unreadable selected-language content resolves deterministically to the bundled English gloss with a visible English-fallback label and explanation.
- Arabic ayah text has independent RTL direction, selected state, position labels, and previous/next accessibility actions; contextual Urdu/Persian meanings render RTL independently of app chrome.
- Collapsed ayah viewport sizing accounts for system `fontScale`; cards use content-driven minimum sizing and the terminology guide remains height-constrained and scrollable.
- Light/dark presentation continues to use semantic theme palettes, and selector/sheet motion continues to respect reduced-motion settings.

Environment availability:

- Android API 36 emulator `emulator-5554` is attached for development verification.
- A current-source debuggable version `1.0.0` build was compiled, installed, and opened successfully on that emulator. The existing release APK checksum still matches `bb99ccba899aba485c686289e28295b45e3a5a4d92255aa6022ee1078c6930aa`, but it predates this Phase 4 source state.
- No `ios/` project is present, so VoiceOver/Dynamic Type verification remains deferred with Phase 8/9B.

Emulator checks completed:

- The `/study/word/3/3/9` deep link opens the redesigned screen with the correct selected word, four study tabs, and Morphology selected by default.
- With the installed Bangla pack selected, the screen reads the exact offline word value `এবং তিনি অবতীর্ণ করেছেন` and labels it `Bangla · Installed offline`.
- With uninstalled Urdu selected, the screen shows the bundled English gloss and visibly labels it `English fallback · Bundled offline`, including the reason that Urdu is unavailable offline for that word.
- At Android font scale `1.3`, the collapsed full-ayah selector grows to fit its scaled Arabic lines and remains expandable; the contextual meaning, source badge, morphology cards, and following heading remain readable without overlap.
- With the app's dark theme selected, the ayah, tabs, morphology segments, contextual meaning/source badge, and cards retain readable contrast. Emulator font scale, theme, and selected word language were restored after the audit.

Still required before release approval:

- Repeat TalkBack focus/selection announcements on physical Android hardware.
- Repeat largest font and display scales, light/dark themes, LTR/RTL app languages, and the expanded/collapsed long-ayah selector on physical hardware and the final production-signed artifact.
- Verify airplane-mode behavior with bundled English only and with an installed non-English word-language pack.
- Complete the stress, low-memory, audio, rollback, privacy, and qualified scholarly review rows above.
