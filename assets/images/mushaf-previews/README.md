These transparent PNGs are bundled script samples for the Mushaf download panel.
They show the existing card's excerpt from Quran 3:3, rendered with the bundled
UthmanicHafs1Ver18 and IndoPak fonts. Font attribution is in `assets/fonts/LICENSES.md`.

They illustrate the script, not an exact page layout or Tajweed coloring. The cards
label them “Script sample”; V1, V2, and Tajweed share the Uthmani sample, and both
IndoPak layouts share the IndoPak sample. Do not add invented Tajweed colors.

The native Image component tints the transparent samples for light/dark mode.
No WebView, font loading, or network request is needed to display them.

Regenerate on macOS from the repository root:

```sh
swift scripts/generate-mushaf-previews.swift "$PWD"
```
