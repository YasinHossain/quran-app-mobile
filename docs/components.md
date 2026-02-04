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
