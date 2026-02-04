# Design Tokens Alignment

This document mirrors the semantic design tokens used in the web app so mobile UI can stay aligned across color, typography, and spacing decisions.

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

Recommended hierarchy (mirrors current UI usage):

- Page titles: `text-2xl font-bold`
- Section titles: `text-xl font-semibold`
- Card titles: `text-lg font-bold`
- Body: `text-base`
- Small labels: `text-xs font-semibold`

## Spacing
Spacing relies on the default Tailwind scale (`space-*`, `p-*`, `m-*`) to stay consistent with the web app's spacing rhythm. Use the following guidelines:

- Card padding: `p-4`
- Section padding: `px-4 py-3`
- List/item gaps: `gap-2` or `gap-3`
- Screen padding: `px-4` and `pt-4`

## Radius
Border radii are extended to match web app tokens:

- `rounded-sm`: `6px`
- `rounded-md`: `8px`
- `rounded-lg`: `12px`
- `rounded-xl`: `16px`
- `rounded-2xl`: `24px`
