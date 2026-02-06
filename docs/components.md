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

## Surah Reader Components

| Component | Description | File Path |
| --- | --- | --- |
| `SurahHeaderCard` | Surah intro/header block (calligraphy + metadata), web-like. | `components/surah/SurahHeaderCard.tsx` |
| `VerseCard` | Separated verse row (verse key + Arabic + translations + ellipsis trigger). | `components/surah/VerseCard.tsx` |
| `VerseActionsSheet` | Bottom sheet for per-verse actions (play, tafsir, pin/bookmark, add to plan, share). | `components/surah/VerseActionsSheet.tsx` |

## Tafsir Components

| Component | Description | File Path |
| --- | --- | --- |
| `AyahNavigationBar` | Top navigation pill for tafsir (back + previous/next). | `components/tafsir/AyahNavigationBar.tsx` |
| `TafsirTabs` | Multi-tafsir tab selector + content renderer. | `components/tafsir/TafsirTabs.tsx` |
| `TafsirHtml` | HTML renderer for tafsir content (headings/paragraphs). | `components/tafsir/TafsirHtml.tsx` |
