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
| `ComprehensiveSearchModal` | Web-parity search overlay/dropdown shell (input, Go To form state, navigation/verse preview, CTA to full results). | `components/search/ComprehensiveSearchModal.tsx` |
| `HeaderSearchBar` | Shared safe-area header shell and icon-button treatment for Home and Surah search headers. | `components/search/HeaderSearchBar.tsx` |
| `HeaderSearchInput` | Header search text input (web-style) used by Home, Surah, and settings search surfaces. | `components/search/HeaderSearchInput.tsx` |
| `ComprehensiveSearchDropdown` | Under-header dropdown card for the Surah header search (Go To when empty; quick results when typing). | `components/search/ComprehensiveSearchDropdown.tsx` |
| `GoToSurahVerseCard` | Web-parity “Go To” form (Surah + Verse selector row, Go action, and suggestion actions); supports card and embedded modes while delegating native selection to the shared bottom-sheet picker. | `components/search/GoToSurahVerseCard.tsx` |
| `SurahVerseSelectorRow` | Shared Surah + Verse selector row (compact closed fields that open the shared bottom-sheet picker). | `components/search/SurahVerseSelectorRow.tsx` |
| `SurahVersePickerSheet` | Native bottom-sheet Surah/Ayah picker with search fields, centered snap-wheel result columns, and a pinned action bar; reused by Go To, quick links, planner, and audio range forms. | `components/search/SurahVersePickerSheet.tsx` |
| `AnchoredDropdownModal` | Transparent modal that anchors dropdown content to a measured view (useful for web-like select overlays). | `components/search/AnchoredDropdownModal.tsx` |
| `HighlightedText` | Lightweight `<em>` tag highlighter renderer for search result snippets. | `components/search/HighlightedText.tsx` |
| `SearchVerseResultCard` | Search results list item (Arabic + highlighted match snippet). | `components/search/SearchVerseResultCard.tsx` |

## Navigation Header Components

| Component / Hook | Description | File Path |
| --- | --- | --- |
| `AppHeader` | Shared safe-area navigation header for non-reader screens such as Bookmarks and Planner. | `components/navigation/AppHeader.tsx` |
| `AppSearchHeader` | Shared safe-area header search layout used by Home and reader screens. | `components/navigation/AppHeader.tsx` |
| `ReaderOverlayHeader` | Absolute reader header shell used when vertical reading scroll should collapse the header. | `components/navigation/AppHeader.tsx` |
| `useHeaderSearch` | Shared header search state/navigation hook for Home, Surah/Mushaf, and Tafsir. | `components/navigation/useHeaderSearch.ts` |
| `useCollapsibleReaderHeader` | Native-driver hide/show behavior for reader headers based on vertical scroll direction. | `components/navigation/useCollapsibleReaderHeader.ts` |

## Reader Data Hooks

| Hook | Description | File Path |
| --- | --- | --- |
| `useMushafPageData` | Local-only mushaf page data hook that resolves the active installed pack version and returns page lookup, verse/word payload, and grouped page lines for the page route. | `hooks/useMushafPageData.ts` |
| `useMushafPackManager` | Local mushaf pack manager hook used by reader settings; loads install state from the mushaf registry, merges download-index progress/errors, and exposes install/delete actions for downloadable mushaf packs like QCF V1/V2, QPC Hafs, IndoPak, and Tajweed. | `hooks/useMushafPackManager.ts` |

## Mushaf Reader Components

| Component | Description | File Path |
| --- | --- | --- |
| `MushafNativePage` | Native Unicode mushaf renderer for offline text packs; renders page lines/words from local pack payloads with stepped `mushafScaleStep` sizing, selectable text, per-word press events, and no route-level chrome so the page route can present a text-only mushaf feed. | `components/mushaf/MushafNativePage.tsx` |
| `MushafWebViewPage` | Local WebView mushaf renderer for exact/downloadable packs; ports the web stepped preset sizing, fit detection, centered RTL overflow reflow, local QCF page-font loading, and the selection/word-tap bridge while keeping the rendered surface free of extra cards, labels, and buttons. | `components/mushaf/MushafWebViewPage.tsx` |
| `MushafSingleDocumentReader` | Single-surface QCF/WebView mushaf reader used by Surah Mushaf view and the exact page route; reports active page changes, scroll activity, word taps, exposes imperative page jumps for page-by-page scrubber navigation, and background-warms bounded surah page windows after first paint. | `components/mushaf/MushafSingleDocumentReader.tsx` |

## Reader Settings Components

| Component | Description | File Path |
| --- | --- | --- |
| `SettingsSidebar` | Right-side drawer (modal + animation) used for the reader settings panel, with explicit safe-area inset padding to keep the first-open animation stable. | `components/reader/settings/SettingsSidebar.tsx` |
| `SettingsSidebarContent` | Settings UI content (web-parity header, tabs, sections, and subpanels/controls). | `components/reader/settings/SettingsSidebarContent.tsx` |
| `IndexScrubber` | Shared right-side 1-based index scrubber used by verse and exact mushaf page readers; maps drag position to an index and delegates scrolling to the owning screen/reader. | `components/reader/IndexScrubber.tsx` |
| `SettingsTabToggle` | Segmented control for switching between settings tabs. | `components/reader/settings/SettingsTabToggle.tsx` |
| `CollapsibleSection` | Collapsible section wrapper used by settings groups. | `components/reader/settings/CollapsibleSection.tsx` |
| `ToggleRow` | Label + switch row for boolean settings. | `components/reader/settings/ToggleRow.tsx` |
| `FontSizeSlider` | Slider row used for font size controls. | `components/reader/settings/FontSizeSlider.tsx` |
| `SelectionBox` | Pressable selection row used for “pick one” settings. | `components/reader/settings/SelectionBox.tsx` |
| `MushafPackOptionCard` | Mushaf-pack settings card that shows install status, progress/error state, source note, and pack actions like Use / Install / Delete. | `components/reader/settings/MushafPackOptionCard.tsx` |
| `ManageTranslationsPanel` | Web-parity “Manage Translations” panel (search + language tabs + My Selections) plus offline download/delete/cancel actions with hosted-pack size resolution. | `components/reader/settings/ManageTranslationsPanel.tsx` |
| `ManageTafsirsPanel` | Web-parity “Manage Tafsirs” panel (search + language tabs + My Selections + limit warning) plus the same offline download/delete/cancel flow used by translations, backed by hosted tafsir packs or the optimized bulk API fallback. | `components/reader/settings/ManageTafsirsPanel.tsx` |
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
| `VerseScrubber` | Thin Surah-specific wrapper around `IndexScrubber` for verse-number scrubbing in the translation view. | `components/surah/VerseScrubber.tsx` |
| `WordByWordVerse` | Word-by-word verse renderer (per-word Arabic with optional per-word translation). When the audio player is visible, words are tap-to-seek and the active word is highlighted. | `components/surah/WordByWordVerse.tsx` |
| `HostedWordTranslationPackRepository` | Offline word-by-word pack installer backed by the GitHub-hosted `dist/word-translation-packs/catalog.json`; imports language-scoped word JSON into SQLite for download-only word languages. | `src/core/infrastructure/word-translations/HostedWordTranslationPackRepository.ts` |
| `useVerseAudioWordSync` | Hook that wires QDC word timing segments to the verse renderer (active word highlight + tap-to-seek). | `components/surah/useVerseAudioWordSync.ts` |
| `VerseActionsSheet` | Bottom sheet for per-verse actions (play, tafsir, pin/bookmark, add to plan, share). | `components/surah/VerseActionsSheet.tsx` |
| `AddToPlannerModal` | Modal for selecting an existing planner to track progress from a verse (web-style Add-to-plan flow). | `components/verse-planner-modal/AddToPlannerModal.tsx` |

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
