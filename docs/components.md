# Component Inventory

This document lists reusable UI components currently available in the codebase so they can be reused before new ones are created.

## Base Components

| Component | Description | File Path |
| --- | --- | --- |
| `EditScreenInfo` | Helper panel for developer instructions, including a path display and external docs link. | `components/EditScreenInfo.tsx` |
| `ExternalLink` | Expo Router `Link` wrapper that opens external URLs in an in-app browser on native. | `components/ExternalLink.tsx` |
| `MonoText` | Themed text component with a monospace font for code-like snippets. | `components/StyledText.tsx` |
| `Text`, `View`, `useThemeColor` | Themed primitives that apply light/dark colors based on the current color scheme. | `components/Themed.tsx` |

## Home Screen Components

| Component | Description | File Path |
| --- | --- | --- |
| `HomeTabToggle` | Two-state segmented control for toggling between Surah and Juz tabs. | `components/home/HomeTabToggle.tsx` |
| `JuzCard` | Pressable card that links to a Juz detail screen and shows Juz number/range. | `components/home/JuzCard.tsx` |
| `JuzGrid` | Responsive grid list layout for rendering multiple Juz cards. | `components/home/JuzGrid.tsx` |
| `SurahCard` | Pressable card that links to a Surah detail screen with metadata. | `components/home/SurahCard.tsx` |
| `SurahGrid` | Responsive grid list layout for rendering multiple Surah cards. | `components/home/SurahGrid.tsx` |

## Search Components

| Component | Description | File Path |
| --- | --- | --- |
| `HeaderSearchButton` | Header-sized search input button (opens comprehensive search overlay). | `components/search/HeaderSearchButton.tsx` |
| `ComprehensiveSearchModal` | Web-parity search overlay/dropdown shell (input, Go To form state, navigation/verse preview, CTA to full results). | `components/search/ComprehensiveSearchModal.tsx` |
| `HeaderSearchInput` | Header search text input (web-style) used on the Surah reader header. | `components/search/HeaderSearchInput.tsx` |
| `ComprehensiveSearchDropdown` | Under-header dropdown card for the Surah header search (Go To when empty; quick results when typing). | `components/search/ComprehensiveSearchDropdown.tsx` |
| `GoToSurahVerseCard` | Web-parity “Go To” form (Surah + Verse selectors, Go action, and suggestion actions); supports card and embedded modes. | `components/search/GoToSurahVerseCard.tsx` |
| `SurahVerseSelectorRow` | Shared Surah + Verse selector row (uses the same dropdown selectors as the Go To card). | `components/search/SurahVerseSelectorRow.tsx` |
| `AnchoredDropdownModal` | Transparent modal that anchors dropdown content to a measured view (useful for web-like select overlays). | `components/search/AnchoredDropdownModal.tsx` |
| `HighlightedText` | Lightweight `<em>` tag highlighter renderer for search result snippets. | `components/search/HighlightedText.tsx` |
| `SearchVerseResultCard` | Search results list item (Arabic + highlighted match snippet). | `components/search/SearchVerseResultCard.tsx` |

## Reader Settings Components

| Component | Description | File Path |
| --- | --- | --- |
| `SettingsSidebar` | Right-side drawer (modal + animation) used for the reader settings panel. | `components/reader/settings/SettingsSidebar.tsx` |
| `SettingsSidebarContent` | Settings UI content (tabs + sections + controls). | `components/reader/settings/SettingsSidebarContent.tsx` |
| `SettingsTabToggle` | Segmented control for switching between settings tabs. | `components/reader/settings/SettingsTabToggle.tsx` |
| `CollapsibleSection` | Collapsible section wrapper used by settings groups. | `components/reader/settings/CollapsibleSection.tsx` |
| `ToggleRow` | Label + switch row for boolean settings. | `components/reader/settings/ToggleRow.tsx` |
| `FontSizeSlider` | Slider row used for font size controls. | `components/reader/settings/FontSizeSlider.tsx` |
| `SelectionBox` | Pressable selection row used for “pick one” settings. | `components/reader/settings/SelectionBox.tsx` |
| `ManageTranslationsPanel` | Web-parity “Manage Translations” panel (search + language tabs + My Selections). | `components/reader/settings/ManageTranslationsPanel.tsx` |
| `ManageTafsirsPanel` | Web-parity “Manage Tafsirs” panel (search + language tabs + My Selections + limit warning). | `components/reader/settings/ManageTafsirsPanel.tsx` |
| `ResourceTabs` | Horizontal language tabs with scroll buttons (used by translation/tafsir panels). | `components/reader/settings/resource-panel/ResourceTabs.tsx` |
| `ResourceItem` | Selectable resource row (used by translation/tafsir panels). | `components/reader/settings/resource-panel/ResourceItem.tsx` |
| `ReorderableSelectionList` | “My Selections” list (remove + reorder + reset). | `components/reader/settings/resource-panel/ReorderableSelectionList.tsx` |

## Surah Reader Components

| Component | Description | File Path |
| --- | --- | --- |
| `SurahHeaderCard` | Surah intro/header block (calligraphy + metadata), web-like. | `components/surah/SurahHeaderCard.tsx` |
| `VerseCard` | Separated verse row (verse key + Arabic + translations + ellipsis trigger). | `components/surah/VerseCard.tsx` |
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
| `TafsirTabs` | Multi-tafsir tab selector + content renderer. | `components/tafsir/TafsirTabs.tsx` |
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
| `LastReadSection` | “Recent / Last visited” section (header + grid + empty state) used in Bookmarks → Recent. | `components/bookmarks/last-read/LastReadSection.tsx` |
| `LastReadCard` | Recent card showing a surah progress ring + verse position + remove action. | `components/bookmarks/last-read/LastReadCard.tsx` |
