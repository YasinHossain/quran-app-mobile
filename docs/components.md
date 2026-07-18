# Component Inventory

This document lists reusable UI components currently available in the codebase so they can be reused before new ones are created.

## Base Components

| Component | Description | File Path |
| --- | --- | --- |
| `EditScreenInfo` | Helper panel for developer instructions, including a path display and external docs link. | `components/EditScreenInfo.tsx` |
| `ExternalLink` | Expo Router `Link` wrapper that opens external URLs in an in-app browser on native. | `components/ExternalLink.tsx` |
| `MonoText` | Themed text component with a monospace font for code-like snippets. | `components/StyledText.tsx` |
| `Text`, `View`, `useThemeColor` | Themed primitives that apply light/dark colors based on the current color scheme. | `components/Themed.tsx` |

## Motion Utilities

| Utility | Description | File Path |
| --- | --- | --- |
| `useModalTransition` | Shared native-driver modal/sheet transition state used by dialogs, bottom sheets, and side drawers for consistent open/close timing. | `components/motion/modalTransition.ts` |

## Home Screen Components

| Component | Description | File Path |
| --- | --- | --- |
| `HomeVersePlaceholder` | Centered verse-preview placeholder used as the temporary hero area on the redesigned home screen. | `components/home/HomeVersePlaceholder.tsx` |
| `HomeShortcutGrid` | Four home shortcut tiles wired to `Recent`, `Bookmarks`, `Pinned`, and `Planner`. | `components/home/HomeShortcutGrid.tsx` |
| `HomeRecentCard` | Compact recent section that shows up to five last-read quick-access chips and opens the selected verse. | `components/home/HomeRecentCard.tsx` |
| `HomeQuickLinksCard` | Persisted home quick-link pills for up to five selected surah/verse targets, with an add modal that reuses the shared Go To selectors. | `components/home/HomeQuickLinksCard.tsx` |
| `HomeTabToggle` | Three-state segmented control for switching between `Surah`, `Juz`, and `Page`; used as the single sticky tab item in the home list. | `components/home/HomeTabToggle.tsx` |
| `JuzCard` | Pressable card that links to a Juz detail screen and shows Juz number/range. | `components/home/JuzCard.tsx` |
| `JuzGrid` | Responsive virtualized grid list for rendering Juz cards without mounting the full tab at once. | `components/home/JuzGrid.tsx` |
| `PageCard` | Pressable card that links to a mushaf page reader route. | `components/home/PageCard.tsx` |
| `PageGrid` | Responsive virtualized grid list for all 604 mushaf pages on the home screen. | `components/home/PageGrid.tsx` |
| `SurahCard` | Pressable card that links to a Surah detail screen with metadata. | `components/home/SurahCard.tsx` |
| `SurahGrid` | Responsive virtualized grid list for rendering all Surah cards without staged loading. | `components/home/SurahGrid.tsx` |

## Search Components

| Component | Description | File Path |
| --- | --- | --- |
| `HeaderSearchButton` | Header-sized search input button (opens comprehensive search overlay). | `components/search/HeaderSearchButton.tsx` |
| `ComprehensiveSearchModal` | Mobile search overlay/dropdown shell (input, Go To form state, navigation/verse preview, CTA to full results). | `components/search/ComprehensiveSearchModal.tsx` |
| `HeaderSearchBar` | Shared safe-area header shell and icon-button treatment for Home and Surah search headers. | `components/search/HeaderSearchBar.tsx` |
| `HeaderSearchInput` | Header search text input (web-style) used by Home, Surah, and settings search surfaces. | `components/search/HeaderSearchInput.tsx` |
| `ComprehensiveSearchDropdown` | Under-header dropdown card for the Surah header search (Go To when empty; quick results when typing). | `components/search/ComprehensiveSearchDropdown.tsx` |
| `GoToSurahVerseCard` | Mobile “Go To” form (Surah + Verse selectors, Go action, and suggestion actions); supports card and embedded modes. Its native modal input is aligned over the closed selector field to preserve keyboard/list behavior without a visible position jump. | `components/search/GoToSurahVerseCard.tsx` |
| `SurahVerseSelectorRow` | Shared Surah + Verse selector row (uses the same dropdown selectors as the Go To card). | `components/search/SurahVerseSelectorRow.tsx` |
| `AnchoredDropdownModal` | Transparent modal that anchors dropdown content to a measured view (useful for web-like select overlays). | `components/search/AnchoredDropdownModal.tsx` |
| `HighlightedText` | Lightweight `<em>` tag highlighter renderer for search result snippets. | `components/search/HighlightedText.tsx` |
| `SearchVerseResultCard` | Search results list item (Arabic + highlighted match snippet). | `components/search/SearchVerseResultCard.tsx` |

## Navigation Header Components

| Component / Hook | Description | File Path |
| --- | --- | --- |
| `AppHeader` | Shared safe-area navigation header for non-reader screens such as Bookmarks and Planner. | `components/navigation/AppHeader.tsx` |
| `AppSearchHeader` | Shared safe-area header search layout used by Home and reader screens. | `components/navigation/AppHeader.tsx` |
| `ReaderOverlayHeader` | Absolute reader header shell used when vertical reading scroll should collapse the header. | `components/navigation/AppHeader.tsx` |
| `useHeaderSearch` | Shared header search state/navigation hook for Home, Surah/Mushaf, and Tafsir, with explicit Translation and exact-verse Mushaf Go To destinations kept separate from current-mode-preserving result navigation. | `components/navigation/useHeaderSearch.ts` |
| `useCollapsibleReaderHeader` | Native-driver hide/show behavior for reader headers based on vertical scroll direction. | `components/navigation/useCollapsibleReaderHeader.ts` |

## Reader Data Hooks

| Hook | Description | File Path |
| --- | --- | --- |
| `useMushafPageData` | Local-only mushaf page data hook that resolves the active installed pack version and returns page lookup, verse/word payload, and grouped page lines for the page route. | `hooks/useMushafPageData.ts` |
| `prepareMushafVerseTarget` | Shared exact-verse Mushaf navigation preparation used by Go To and Translation-to-Mushaf switching; resolves the local page, validates the active pack version, and either awaits full page readiness or shares its in-flight warmup with the entering route. | `lib/mushaf/prepareMushafVerseTarget.ts` |
| `useMushafPackManager` | Local mushaf pack manager hook used by reader settings; loads install state from the mushaf registry, merges download-index progress/errors, and exposes install/delete actions for downloadable mushaf packs like QCF V1/V2, QPC Hafs, IndoPak, and Tajweed. | `hooks/useMushafPackManager.ts` |
| `useDownloadedResourceSize` / `useDownloadedResourceSizes` | Resolve the installed-resource total plus per-item sizes shown in Downloads, counting SQLite-backed offline content plus downloaded audio and mushaf-pack files. | `hooks/useDownloadedResourceSize.ts` |

## Localization Providers

| Provider / Utility | Description | File Path |
| --- | --- | --- |
| `UiLanguageProvider` | Lightweight mobile UI translation provider backed by the website locale JSON copied into `locales/{en,bn,hi,ar,ur}`; reads persisted `settings.uiLanguage` and exposes `useUiTranslation()` for web-matching labels without changing Quran translation defaults. | `providers/UiLanguageContext.tsx` |
| `UI_LANGUAGES` | Shared UI language list and native labels mirrored from the web app (`English`, `বাংলা`, `العربية`, `اردو`, `हिन्दी`). | `lib/i18n/uiLanguages.ts` |
| `localizeNumbers` / `plannerText` | Digit localization and planner helper-text normalization used so Bangla/Hindi/Arabic/Urdu render localized numbers in cards, selectors, progress rings, and generated planner labels. | `lib/i18n/` |

## Mushaf Reader Components

| Component | Description | File Path |
| --- | --- | --- |
| `MushafNativePage` | Native Unicode mushaf renderer for offline text packs; renders page lines/words from local pack payloads with stepped `mushafScaleStep` sizing, selectable text, per-word press events, and no route-level chrome so the page route can present a text-only mushaf feed. | `components/mushaf/MushafNativePage.tsx` |
| `MushafWebViewPage` | Local WebView mushaf renderer for exact/downloadable packs; ports the web stepped preset sizing, fit detection, centered RTL overflow reflow, resilient local QCF page-font loading with bounded recovery retries, and the selection/word-tap bridge while keeping the rendered surface free of extra cards, labels, and buttons. | `components/mushaf/MushafWebViewPage.tsx` |
| `MushafSingleDocumentReader` | Single-surface QCF/WebView mushaf reader used by Surah, Juz, and Page Mushaf views; reports active page changes, scroll activity, selection, and canonical word taps (including surface text), exposes imperative page jumps for scrubber navigation, supports hidden first-page preparation during Translation mode, delivers installed QCF page fonts to the WebView as cached data URIs with file-URL/retry fallback, and limits visible-mode background warming to the nearest pages. | `components/mushaf/MushafSingleDocumentReader.tsx` |

## Reader Settings Components

| Component | Description | File Path |
| --- | --- | --- |
| `SettingsSidebar` | Right-side drawer (modal + animation) used for the reader settings panel, with explicit safe-area inset padding to keep the first-open animation stable. | `components/reader/settings/SettingsSidebar.tsx` |
| `SettingsSidebarContent` | Shared mobile settings content (header, tabs, sections, and subpanels/controls). | `components/reader/settings/SettingsSidebarContent.tsx` |
| Full-screen Settings route | Home-menu settings surface that reuses `SettingsSidebarContent` at full screen width instead of the reader side drawer. | `app/settings.tsx` |
| `IndexScrubber` | Shared right-side 1-based index scrubber used by verse and exact mushaf page readers; maps drag position to an index and delegates scrolling to the owning screen/reader. | `components/reader/IndexScrubber.tsx` |
| `SettingsTabToggle` | Segmented control for switching between settings tabs. | `components/reader/settings/SettingsTabToggle.tsx` |
| `CollapsibleSection` | Collapsible section wrapper used by settings groups. | `components/reader/settings/CollapsibleSection.tsx` |
| `ToggleRow` | Label + switch row for boolean settings. | `components/reader/settings/ToggleRow.tsx` |
| `FontSizeSlider` | Slider row used for font size controls; keeps native thumb/label feedback local while dragging and commits the reader setting on release. | `components/reader/settings/FontSizeSlider.tsx` |
| `SelectionBox` | Pressable selection row used for “pick one” settings. | `components/reader/settings/SelectionBox.tsx` |
| `MushafPackOptionCard` | Mushaf-pack settings card that shows install status, progress/error state, source note, and pack actions like Use / Install / Delete. | `components/reader/settings/MushafPackOptionCard.tsx` |
| `ManageTranslationsPanel` | Mobile “Manage Translations” panel (search + language tabs + My Selections) with immediate optimistic selection feedback, coalesced reader commits, and offline download/delete/cancel actions with hosted-pack size resolution. | `components/reader/settings/ManageTranslationsPanel.tsx` |
| `ManageTafsirsPanel` | Mobile “Manage Tafsirs” panel (search + language tabs + My Selections + limit warning) plus the same offline download/delete/cancel flow used by translations, backed by hosted tafsir packs or the optimized bulk API fallback. | `components/reader/settings/ManageTafsirsPanel.tsx` |
| `ResourceTabs` | Horizontal language tabs with scroll buttons (used by translation/tafsir panels). | `components/reader/settings/resource-panel/ResourceTabs.tsx` |
| `ResourceItem` | Selectable resource row (used by translation/tafsir panels). | `components/reader/settings/resource-panel/ResourceItem.tsx` |
| `ResourceDownloadAction` | Shared trailing action UI for resource downloads (download, progress ring/cancel, delete, deleting state). | `components/reader/settings/resource-panel/ResourceDownloadAction.tsx` |
| `ResourceConfirmModal` | Shared confirmation modal for resource download/delete flows with optional size detail line. | `components/reader/settings/resource-panel/ResourceConfirmModal.tsx` |
| `ReorderableSelectionList` | “My Selections” list (remove + reorder + reset). | `components/reader/settings/resource-panel/ReorderableSelectionList.tsx` |

## Surah Reader Components

| Component | Description | File Path |
| --- | --- | --- |
| `SurahHeaderCard` | Surah intro/header block with a prominent English title, verse count plus Mecca/Medina subheading, offline revelation-place artwork, and responsive Bismillah calligraphy. It is rendered directly by both Translation and Mushaf modes. | `components/surah/SurahHeaderCard.tsx` |
| `BismillahDisplay` | Slim responsive Bismillah vector calligraphy centered over a matching fine-line ornament; both use muted emerald in light mode and soft white in dark mode. Shared by Surah, Juz, and Page readers. | `components/surah/BismillahDisplay.tsx` |
| `BismillahCalligraphy` | Memoized single-path Bismillah artwork extracted from the bundled Amiri Quran font; matches the web’s elongated fallback style without platform-dependent font shaping. | `components/surah/BismillahCalligraphy.tsx` |
| `BismillahOrnament` | Lightweight, memoized SVG frame with original mirrored floral geometry; kept separate from the live calligraphy for crisp scaling and accessibility. | `components/surah/BismillahOrnament.tsx` |
| `RevelationPlaceIllustration` | Theme-aware, offline native illustration that renders a Makkah/Kaaba or Madinah/dome motif without image loading or SVG work inside the virtualized reader list. | `components/surah/RevelationPlaceIllustration.tsx` |
| `VerseCard` | Separated verse row (verse key + Arabic + translations + ellipsis trigger) with optional subtle highlight for the active audio verse. | `components/surah/VerseCard.tsx` |
| `TajweedNativeText` | Native Surah verse-card Tajweed renderer; loads the installed QCF Tajweed V4 page font with Expo Font and renders local `codeV2` glyphs in React Native `Text`, with tagged Uthmani text as a fallback. | `components/surah/TajweedNativeText.tsx` |
| `NativeSurahReader` | Android Kotlin-backed Surah translation reader surface for plain, word-by-word, Tajweed, and active word-sync rows. Exact QCF glyph-to-word spans make Tajweed words tappable without changing shaping, attached marks, line wrapping, or the non-tappable verse-end marker. React Native owns Word Study, data loading, settings, verse actions, and audio controls while Kotlin owns row rendering, hit testing, inertial scrolling, and the RecyclerView edge fast scroller. | `components/surah/native/NativeSurahReader.tsx` |
| `VerseScrubber` | Thin Surah-specific wrapper around `IndexScrubber` for verse-number scrubbing on non-Android translation readers; Android's Kotlin reader uses its native RecyclerView fast scroller with the same thumb and live `verse/total` label styling. | `components/surah/VerseScrubber.tsx` |
| `WordByWordVerse` | Word-by-word verse renderer with optional per-word translation. Android reader integrations use a normal word tap for canonical Word Study, highlight the selected study word, and keep audio seek/play available through explicit actions. | `components/surah/WordByWordVerse.tsx` |
| `HostedWordTranslationPackRepository` | Offline word-by-word pack installer backed by the GitHub-hosted `dist/word-translation-packs/catalog.json`; imports language-scoped word JSON into SQLite for download-only word languages. | `src/core/infrastructure/word-translations/HostedWordTranslationPackRepository.ts` |
| `useVerseAudioWordSync` | Hook that wires QDC word timing segments to active-word highlighting and explicit play-word / play-verse-from-word actions. | `components/surah/useVerseAudioWordSync.ts` |
| `VerseActionsSheet` | Bottom sheet for per-verse actions (play, tafsir, pin/bookmark, add to plan, share). | `components/surah/VerseActionsSheet.tsx` |
| `AddToPlannerModal` | Modal for selecting an existing planner to track progress from a verse (web-style Add-to-plan flow). | `components/verse-planner-modal/AddToPlannerModal.tsx` |
| `WordQuickSheet` | Reusable, explicitly height-constrained Word Study bottom sheet with a prominent word-audio control, horizontal color-plus-text segment labels, contextual gloss, centered lemma/root tiles, and a four-action Verse/Save/Share/More bar whose More action opens the full study route. Detailed morphology and source attribution remain in that full route. | `components/word-study/WordQuickSheet.tsx` |
| `ReaderWordStudySheet` | Shared Surah/Juz/Page adapter that connects the canonical word event and controller to the one React Native quick sheet, explicit audio actions, attributed sharing, and full-study route. | `components/word-study/ReaderWordStudySheet.tsx` |
| `useWordQuickSheetController` | Tap-to-sheet controller that presents the loading shell before querying the offline Word Study repository, ignores stale results, retries failures, and records tap-to-present/tap-to-resolution timings. | `components/word-study/useWordQuickSheetController.ts` |
| `WordStudyPressEvent` | Canonical cross-reader word-press contract and normalizer keyed only by `surah:ayah:wordPosition`; numeric word IDs remain advisory. | `components/word-study/WordStudyPressEvent.ts` |
| `WordSegmentsCard` | Reusable segmented Arabic word card shared by the quick sheet and full study screen; combines POS color with underlines, readable labels, RTL text, per-segment accessibility announcements, and opt-in horizontal legend presentation while retaining the stacked default. | `components/word-study/WordSegmentsCard.tsx` |
| `AyahContextSelector` | Reusable unboxed full-ayah Word Study selector with larger, modestly spaced wrapping RTL word targets, color-only route selection, hidden pre-measurement to avoid full-ayah startup flashes, reduced-motion support, smoothly animated expansion and native-driven selected-centered three-line window movement, accessible expand state, and nonvisual previous/next actions. | `components/word-study/full-study/AyahContextSelector.tsx` |
| `ayahContextSelectorModel` | Pure line-grouping and selected-centered collapsed-window calculation used by the full-ayah selector and its early/middle/late selection tests. | `components/word-study/full-study/ayahContextSelectorModel.ts` |
| `WordStudyScreen` | Full offline Word Study route with a wrapping full-ayah selector, route-driven selection, and a Morphology-first tab structure. Morphology places contextual meaning and compact lemma/root facts before segment-specific, nonduplicated feature rows, ending with progressive-disclosure terminology help. | `app/study/word/[surah]/[ayah]/[position].tsx` |
| `MorphologyGuideSheet` | Reusable, accessible, explicitly height-constrained bottom sheet that groups segment and feature definitions with Arabic technical terms and compact examples. | `components/word-study/full-study/MorphologyGuideSheet.tsx` |
| `WordStudySourcesScreen` | Settings-reachable provenance destination built from installed core and dictionary manifests plus the bundled grammar manifest, with versions, rights, checksums, external links, pack details, and methodology boundaries. | `app/word-study-sources.tsx` |
| `DictionarySection` | Phase 11A optional dictionary experience: catalog/download states, independent Lane/Hans source selection, cancellable lemma/root lookup, collapsed root families, lazy entry bodies, and per-source attribution. | `components/word-study/full-study/DictionarySection.tsx` |
| `grammarStudyModel` | Pure Arabic normalization and selected-word-to-source-passage matching for the Grammar tab. Matching changes presentation order only and never rewrites source prose. | `components/word-study/full-study/grammarStudyModel.ts` |
| `SQLiteGrammarStudyRepository` | Read-only verse-keyed repository for the separately bundled Arabic i'rab SQLite pack, including structured missing and unavailable states. | `src/core/infrastructure/word-grammar/SQLiteGrammarStudyRepository.ts` |
| Arabic Grammar pack | Phase 10 compiler, provenance, checksums, coverage, rebuild instructions, and runtime behavior. | `docs/word-grammar-pack.md` |
| Word Study dictionary packs | Phase 11A compiler, Quran-root/lemma coverage, optional multi-pack lifecycle, checksums, and rebuild instructions. | `docs/word-reference-packs.md` |
| `wordStudyScreenModel` | Pure presentation model for applicable-only morphology values with Arabic technical terms, explicit root/lemma states, source grouping, and attributed share copy. | `components/word-study/full-study/wordStudyScreenModel.ts` |
| `OccurrenceExplorer` | Offline surface/lemma/root occurrence browser with explicit counters, availability-aware filters, cancellable fixed-size pages, exact Arabic forms, contextual glosses, ayah context, and exact-word reader navigation. | `components/word-study/full-study/OccurrenceExplorer.tsx` |
| `occurrenceExplorerModel` | Pure occurrence presentation/query model for named counters, scope availability, bounded queries, pagination labels, gloss fallback, and canonical reader-target parameters. | `components/word-study/full-study/occurrenceExplorerModel.ts` |
| Word Study release notes | MVP release scope, source versions/checksums, privacy boundary, blocking sign-offs, and post-MVP exclusions for release-candidate review. | `docs/word-study-release-notes.md` |
| Word Study Android physical-device checklist | Required Phase 9A manual matrix for Android TalkBack, font scale, RTL, contrast, stress, pack rollback, privacy/source notices, and reviewer sign-off. | `docs/word-study-android-physical-device-checklist.md` |

## Audio Components

| Component | Description | File Path |
| --- | --- | --- |
| `AudioPlayerBar` | Global bottom overlay player UI (verse transport + timeline). | `components/audio/AudioPlayerBar.tsx` |
| `PlaybackOptionsModal` | Centered playback options dialog (Reciter + Verse Repeat) including offline surah audio download/delete actions. | `components/audio/PlaybackOptionsModal.tsx` |

## Tafsir Components

| Component | Description | File Path |
| --- | --- | --- |
| `AyahNavigationBar` | Top navigation pill for tafsir (back + previous/next). | `components/tafsir/AyahNavigationBar.tsx` |
| `TafsirTabs` | Sticky multi-tafsir switcher with horizontally scrollable labels, active-tab auto-scroll, and native-safe gesture handling for the tafsir page. | `components/tafsir/TafsirTabs.tsx` |
| `TafsirTabPanels` | Sliding multi-tafsir content viewport that keeps the verse card outside tafsir-switch state and only animates the tafsir body. | `components/tafsir/TafsirTabs.tsx` |
| `TafsirHtml` | HTML renderer for tafsir content (headings/paragraphs). | `components/tafsir/TafsirHtml.tsx` |

## Bookmarks Components

| Component | Description | File Path |
| --- | --- | --- |
| `BookmarkModal` | Modal with “Pin Verse” + “Add to Folder” tabs (offline-first, persisted). | `components/bookmarks/BookmarkModal.tsx` |
| `BookmarkFolderCard` | Folder card UI used in the Bookmarks folder list (glyph, verse preview chips, updated date, options). | `components/bookmarks/BookmarkFolderCard.tsx` |
| `FolderActionsSheet` | Bottom sheet for folder options (Edit Folder, Delete Folder). | `components/bookmarks/FolderActionsSheet.tsx` |
| `FolderSettingsModal` | Create/edit folder modal (name + color) for bookmarks (offline-first, persisted). | `components/bookmarks/FolderSettingsModal.tsx` |
| `DeleteFolderModal` | Delete folder confirmation modal (warns when the folder contains verses). | `components/bookmarks/DeleteFolderModal.tsx` |
| `folderColor` | Shared folder color tokens + resolver used across folder UI (settings + cards). | `components/bookmarks/folderColor.ts` |
| `PlannerSection` | Planner section list UI (header + empty + cards) used in Bookmarks → Planner. | `components/bookmarks/planner/PlannerSection.tsx` |
| `PlannerCard` | Planner card (daily focus + stats + progress + continue/delete). | `components/bookmarks/planner/PlannerCard.tsx` |
| `PlannerHeader` | Planner section header with “Create Plan” action. | `components/bookmarks/planner/PlannerHeader.tsx` |
| `PlannerEmptyState` | Empty-state UI shown when no plans exist. | `components/bookmarks/planner/PlannerEmptyState.tsx` |
| `CreatePlannerModal` | Modal + form for creating planner plans (start/end surah + verse + estimated days). | `components/bookmarks/planner/CreatePlannerModal.tsx` |
| `DeletePlannerModal` | Delete planner confirmation modal matching the project delete-confirmation pattern. | `components/bookmarks/planner/DeletePlannerModal.tsx` |
| `LastReadSection` | “Recent / Last visited” section (header + grid + empty state) used in Bookmarks → Recent. | `components/bookmarks/last-read/LastReadSection.tsx` |
| `LastReadCard` | Recent card showing a surah progress ring + verse position + remove action. | `components/bookmarks/last-read/LastReadCard.tsx` |
| `CircularProgress` | Shared circular progress ring used by Recent cards and compact home recent pills. | `components/bookmarks/last-read/CircularProgress.tsx` |
| `buildNormalizedLastReadEntries` | Shared helper that normalizes stored last-read entries for both the bookmarks recent section and the home recent card. | `components/bookmarks/last-read/lastReadEntries.ts` |
