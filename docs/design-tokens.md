# Mobile Design System Tokens

This document describes the semantic design tokens used by the mobile app. The mobile design system is the source of truth for mobile color, typography, spacing, and shape decisions.

The sibling website may share some token names or values, but the two products can evolve independently. Prefer semantic token names in components so future visual changes remain centralized. Add or refine tokens when a recurring mobile need is not represented; avoid one-off hard-coded colors when an appropriate semantic role exists.

## Colors
Semantic color tokens are defined in `tailwind.config.js` and shared with the web app. Each token maps to light/dark values.

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `background` | `#F7F9F9` | `#0F172A` | App background surfaces. |
| `surface` | `#FFFFFF` | `#1E293B` | Card and sheet surfaces. |
| `surface-navigation` | `#FFFFFF` | `#182333` | Navigation surfaces (tabs, headers). |
| `foreground` | `#374151` | `#E7E5E4` | Primary foreground text/icons. |
| `muted` | `#6B7280` | `#94A3B8` | Secondary text and muted UI. |
| `accent` | `#0D9488` | `#14B8A6` | Primary action and highlight. |
| `accent-hover` | `#0F766E` | `#0D9488` | Hover/pressed accent state. |
| `interactive` | `#F3F4F6` | `#334155` | Interactive backgrounds. |
| `interactive-hover` | `#E5E7EB` | `#475569` | Hover/pressed interactive state. |
| `border` | `#E5E7EB` | `#334155` | Borders/dividers. |
| `error` | `#DC2626` | `#F87171` | Error states. |
| `on-accent` | `#FFFFFF` | `#FFFFFF` | Text/icons on accent backgrounds. |
| `number-badge` | `#F3F4F6` | `#334155` | Number badge background. |
| `content-primary` | `#374151` | `#E7E5E4` | Primary content text. |
| `content-secondary` | `#6B7280` | `#94A3B8` | Secondary content text. |

## Typography
Typography uses Tailwind's font sizing scale with semantic weight utilities (`font-semibold`, `font-bold`, etc.). The mobile app loads `SpaceMono` for special text usage in `components/StyledText.tsx`. All other text uses the platform default font unless specified.

Recommended hierarchy based on current mobile usage:

- Page titles: `text-2xl font-bold`
- Section titles: `text-xl font-semibold`
- Card titles: `text-lg font-bold`
- Body: `text-base`
- Small labels: `text-xs font-semibold`

## Spacing
Spacing relies on the default Tailwind scale (`space-*`, `p-*`, `m-*`) to keep a consistent rhythm across the mobile app. Use the following guidelines as defaults, adapting them when content density, accessibility, or the device form factor requires it:

- Card padding: `p-4`
- Section padding: `px-4 py-3`
- List/item gaps: `gap-2` or `gap-3`
- Screen padding: `px-4` and `pt-4`

## Radius
The mobile radius scale is:

- `rounded-sm`: `6px`
- `rounded-md`: `8px`
- `rounded-lg`: `12px`
- `rounded-xl`: `16px`
- `rounded-2xl`: `24px`
