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

## Reader navigation

Android surah, juz, page, tafsir, and word-study routes open with native-stack `ios_from_right` (`readerScreenAnimation` in `app/_layout.tsx`; set it there, not per screen), a platform-driven
parallax slide with no JS work per frame. React Native Screens forces that animation onto
`accelerate_decelerate` over 200 ms, so `plugins/withReaderPushTransition.js` overrides its open
resources: 300 ms on `reader_push_spring`, a cubic fit of the drawer's entrance spring. The slide
then moves most of the way early and settles like the settings drawer. On a 90 Hz budget phone
this left one skipped vsync per open instead of two, and the worst in-slide frame went from
23–32 ms to ~13 ms. The back animation keeps the library default. iOS retains its native
transition; reduced motion disables it. Native Home navigation does not wait for data warmup:
the reader takes its complete local snapshot on the first render and uses its existing
loading/retry path when the requested content is unavailable locally.

## Modal motion

`components/motion/modalTransition.ts` owns native-driver transitions for dialogs, sheets, drawers, and anchored popovers. Use the shared `preset` option rather than screen-specific durations:

| Preset | Entrance / exit | Movement |
| --- | --- | --- |
| `dialog` (default) | 200 / 140 ms | `dialogTransform`: a 12-point upward movement, no scale. The panel fades on an eased curve that trails the backdrop slightly and completes in about 10 frames. A linear fade left the panel half-transparent for most of the front-loaded spring (on light themes only its coloured controls stood out), while turning it opaque by 60% progress popped it in over ~3 frames. `Dialog` starts the entrance one frame after the overlay is laid out: the first frame (mounting the dialog and caching the screen behind) took ~70 ms on a budget phone, and starting during it made the dialog appear already past halfway. |
| `sheet` | 240 / 160 ms | `verticalSheetTransform`: slide from the bottom. |
| `drawer` | 240 / 160 ms | `sideSheetTransform`: slide from the appropriate side. |
| `popover` | 140 / 100 ms | Opacity only; keep the position attached to its anchor. |
| Bottom tabs | 260 ms spring | `horizontalSlideSceneStyle`: pager-style slide; the incoming tab enters from its side of the tab bar (mirrored in RTL) while the outgoing one leaves. Scenes stay opaque and only translate, so a frame paints about one screen; visited tabs stay attached (`detachInactiveScreens={false}`) so switching back doesn't rebuild the screen's display lists. |

Transitions are native-driver **springs**, not `Animated.timing`. On Android, React Native samples native timing animations from a precomputed 60 fps frame table, so on 90/120 Hz screens every second or third display frame repeats the previous position: the motion judders even on flagship phones. Springs are integrated against the real frame time and advance on every display frame. On a 90 Hz budget phone this raised a sheet entrance from ~14 to ~26 rendered frames and cut missed frame deadlines from 35–50% to 0–8%. `modalSpringConfig` derives the springs from the preset durations: entrances are critically damped (Material standard midpoint, visually complete at the preset duration, no overshoot); exits are light, overshoot-clamped springs that end exactly at the preset duration while still moving, like standard-accelerate. Use native springs for any other frequently seen native-driver motion too (the settings sidebar's sub-panel navigation uses them). The translations and tafsir lists each sit in their own offscreen sub-panel layer, header included, while the settings root is shown. Opening one sets that layer's native selection value and starts the spring in the same tick, with no React commit first: nothing onscreen changes before it moves, and both lists have already been drawn offscreen. Do not share one layer and swap its title or hide the other list with opacity: the slide then starts before the swap commits, so the previous header and list show for the first frames, and an opacity-0 list is only drawn for the first time once it is onscreen. Avoid Android `elevation` and rounded `overflow: 'hidden'` clips on content that slides with a panel; both are re-rendered every frame. Icons repeated in every row of a list use Feather font glyphs (`@expo/vector-icons/Feather`) instead of `lucide-react-native`: on Android, react-native-svg draws each icon into its own bitmap on the UI thread, and replacing the resource-list row icons cut building the tafsir list from ~61–66 ms to ~37–41 ms per frame on a budget phone. One-off icons stay on Lucide.

Bottom sheets use `components/motion/BottomSheet.tsx` rather than assembling their own overlay, backdrop and transform, so every sheet shares one motion. It slides exactly the sheet's own height (measured while hidden), so movement starts on the first frame instead of travelling off-screen first.

Keep work out of the transition window. The animation runs on the native driver, but React commits and native view mounting still compete with it on the UI thread:

- Animated style helpers are cached per progress value. Never build interpolations inline in a way that creates new nodes each render; a new node forces a native re-attach mid-slide.
- Avoid `ActivityIndicator` inside sheets. Creating Android's `ProgressBar` view took ~31 ms on the UI thread on a budget phone, stalling the slide; use a plain skeleton bar.
- Bottom sheets don't clip with `overflow: 'hidden'`; the rounded clip path is re-rasterized every frame. Keep sheet content inside its padding instead.
- Don't set state on open just to reset something; reset it in `onAfterClose` while the surface is hidden.
- Gate optional offscreen work on `useScreenTransitionSettled()`. The JS thread idles while a native stack push is still sliding, so idle callbacks and list batching land mid-slide. Kept-mounted overlays (`PortalOverlay keepMounted`, the `BottomSheet` default) warm only after it; warming on idle alone mounted the reader's sheets (~110 views, ~40 ms of UI-thread work) mid-slide. The tafsir pager renders only the visible verse page until it settles, then widens `windowSize`; building neighbouring pages during the push had cost 3 missed frames per open.

While any portal overlay is presented (including its exit), `OverlayPortalProvider` renders the app behind it as a cached hardware texture (`renderToHardwareTextureAndroid`), so slide frames composite one texture instead of re-rendering all reader text underneath.

GPU fill matters on budget phones, whose GPU stays at its lowest clock during short animations. Don't stack opaque full-screen backgrounds: the root layout and stack screen paint the theme background, so screens and native views under them (the Android surah reader, the native Home index and their `RecyclerView`s and rows; Home relies on the tab scene background) stay transparent, and the Android window background is removed once the React root is showing (`MainApplication.kt`). Check with Developer options → Debug GPU overdraw; the reader body should be blue, not red.

Frequently opened, small surfaces (the Home drawer, verse actions) pass `keepMounted` to `PortalOverlay`: the surface is built once the screen is idle and stays mounted, hidden and inert, while closed, so opening only reveals it and starts the transform. On a budget Android phone this cut the verse sheet's first frame from ~40 ms to ~15 ms and removed a 65–100 ms pause before the drawer began moving. Don't use it for large or data-heavy surfaces such as the settings sidebar.

Centered dialogs use `components/motion/Dialog.tsx` (like `BottomSheet` for sheets), so motion, fade, backdrop, panel style and keyboard handling change in one place. It is a `PortalOverlay` surface, not a React Native `Modal`. A native modal window took ~200 ms to show its first frame on a budget phone, which left the reader blank after the verse actions sheet handed off to the bookmark dialog; the bookmark dialog also passes `keepMounted` because it is opened from that hand-off. The full-screen search, anchored dropdowns and verse translation tooltips still use native modals. Verse translation tooltips remain immediate, measured overlays so they do not add animation work to every rendered verse. Action sheets can use a zero-duration exit when handing off to another dialog.

Dialog rules:

- `Dialog` spreads `fadingSurfaceProps` on its panel; do the same on any other surface that fades. Android otherwise applies the opacity to each child separately, so nested boxes, borders and elevation shadows fade out of step with the panel.
- Close by clearing a target if convenient, but render through `useValueWhileOpen` so the exit animates what the user was looking at instead of an emptied, resized panel.
- `Dialog` keeps the panel centred above the keyboard, never past the top of the safe area. When `react-native-keyboard-controller` reports the keyboard starting to move (`keyboardWillShow`/`keyboardWillHide`, with the destination height; the app root mounts its `KeyboardProvider`), the dialog springs to where it will settle with the sheet entrance spring on the native driver. Following the keyboard frame by frame re-laid out the dialog every frame through Reanimated commits, which pause while React commits, so the lift lagged on budget phones. A panel taller than the space above the keyboard keeps its height and its bottom goes under the keyboard; content still scrolls. Do not use Reanimated's deprecated `useAnimatedKeyboard`: on Android it could report the height late or keep a stale height that pinned the next dialog near the top.
- A dialog that opens for typing passes `initialFocusRef`, so the input is focused as the entrance starts. Content floating outside the panel (selector lists in the root portal) reads `useDialogKeyboard()`: it measures against the dialog's untransformed root and applies the dialog's native lift transform, so it moves exactly with its field. Floating lists open below the field unless less than 160 pt fits, and touching them keeps the keyboard up. Choosing a surah hands focus straight to the verse field, so the keyboard switches to the number pad instead of hiding and showing again.

Start entrance motion from hidden after the overlay's `onShow`, including when the component first mounts already open. Outside `Dialog`, use `onAfterOpen` for keyboard autofocus; use `onAfterClose` for content resets so those layout changes do not overlap the dialog animation. The shared transition skips animation when the system reduced-motion setting is enabled at app startup, and supports reopening during an unfinished exit.
