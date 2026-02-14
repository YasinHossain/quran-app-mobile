# UI Parity Roadmap

This document is the single source of truth for aligning mobile UI with the web experience. It defines what must match, what can diverge, and target parity levels per screen.

Assumes the web repo is available at `../quran-app` (used by `npm run sync:web-core`).

## Parity Table

| Web Feature | Web Path | Mobile Screen | Parity Target | Notes |
| --- | --- | --- | --- | --- |
| Surah page | `../quran-app/app/(features)/surah` | `app/surah/[surahId].tsx` | 90% | Header mirrors web layout (back, header search, settings gear). Header search now uses a web-like interaction: the header input is the source of truth and a dropdown card appears under the header (Go To form when empty; quick nav + verse previews when typing), mirroring `../quran-app/app/shared/search/ComprehensiveSearch.tsx` + `../quran-app/app/shared/components/go-to/GoToSurahVerseForm.tsx`. |
| Juz page | `../quran-app/app/(features)/juz` | `app/juz/[juzNumber].tsx` | 85% | Keep typography scale consistent; layout may be native-scrolled. |
| Tafsir (ayah detail) | `../quran-app/app/(features)/tafsir` | `app/tafsir/[surahId]/[ayahId].tsx` | 90% | Match content order; native sheet/modal presentation is OK. |
| Search | `../quran-app/app/(features)/search` | `app/(tabs)/search.tsx` | 90% | Advanced search implemented online-first (quick + paginated) with nav detection (surah/ayah/juz/page) and verse results; platform-specific input UX allowed. |
| Bookmarks | `../quran-app/app/(features)/bookmarks` | `app/(tabs)/bookmarks.tsx` | 90% | Offline-first folders + pinned; folder cards mirror web (glyph + verse preview chips + updated-at + options); Planner cards are grouped like web (multi-surah ranges show one card); Add-to-plan modal implemented; Recent (Last visited) implemented with persisted last-read cards. |
| Settings | `../quran-app/app/shared/reader/settings` + `../quran-app/app/providers/SettingsContext.tsx` | `app/(tabs)/settings.tsx` | 80% | Core toggles must match; platform-specific system settings entry allowed. |
| Reader settings sidebar | `../quran-app/app/shared/reader/settings` + `../quran-app/app/providers/SettingsContext.tsx` | `app/surah/[surahId].tsx` | 90% | Must match labels/order; OK to stub unimplemented options. |
| Translation + tafsir selection panels | `../quran-app/app/(features)/surah/components/panels/translation-panel` + `../quran-app/app/(features)/surah/components/panels/tafsir-panel` | `components/reader/settings/SettingsSidebarContent.tsx` | 90% | Translation and tafsir selection UIs mirror web (search, language tabs, My Selections box with reorder/remove, selection limits). |
| Verse actions (ellipsis menu) | `../quran-app/app/shared/verse-actions` | `app/surah/[surahId].tsx` | 90% | Keep action list + labels aligned with `actionCreators.ts`; stub behavior OK initially. |

## Parity Targets

- **95–100%**: Must match layout, content order, and interactions; only platform-specific affordances allowed.
- **90–94%**: Minor visual or interaction differences allowed if they improve native usability.
- **80–89%**: Feature set must match, but layout can be adapted to native patterns.
- **Below 80%**: Requires explicit approval and documentation of why it diverges.

## Notes

- When adding new screens or features, update this table first.
- Any intentional divergence must be documented in the Notes column with rationale.
