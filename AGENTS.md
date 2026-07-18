# Quran App Mobile - Agent Guidelines

This Expo/React Native app is a standalone mobile product. Its UX is mobile-first and may introduce features before, after, or independently of the sibling web app in `../quran-app`.

The website is useful for shared business behavior, terminology, content, and feature discovery. It is not the visual or interaction source of truth unless the user explicitly requests a web match.

## Quick commands

- Install: `npm install`
- Run: `npm run android` / `npm run ios`
- Type-check: `npm run type-check`
- Verify before handoff: `npm run verify`
- Sync shared core from web: `npm run sync:web-core` (defaults to `../quran-app`)

## Repository boundaries

- Routes/screens: `app/` (Expo Router)
- Reusable mobile UI: `components/`
- Shared platform-agnostic core: `src/core/domain`, `src/core/application`
- Mobile adapters and native integrations: `src/core/infrastructure`
- Static data: `src/data/`

Path aliases:

- `@/src/core/*` -> `src/core/*`
- `@/src/*` -> `src/core/*` (compatibility for synced web imports)
- `@/*` -> repository root

Prefer `@/src/core/...` for new mobile code. Synced code may continue to use `@/src/...`.

## Product and design decisions

Use this order when requirements leave room for judgment:

1. The user's explicit product goal.
2. Established mobile components and interaction patterns in this repository.
3. Native usability, accessibility, RTL support, performance, and offline behavior.
4. The website as an optional reference.

- Use semantic tokens from `tailwind.config.js`; avoid hard-coded colors when a suitable token exists.
- Reuse or extend an existing component when it fits. Introduce a new component or pattern when it makes the mobile experience clearer or more cohesive.
- Prefer platform-native navigation, gestures, sheets, safe areas, keyboard behavior, and touch targets.
- Keep related screens consistent, but do not preserve a weak pattern solely because it already exists.
- New visual tokens and reusable primitives are allowed when they strengthen the mobile design system; centralize and document durable additions.
- Do not add placeholder or disabled actions merely because they exist on the website. Include actions that belong to the requested mobile experience.

When the user explicitly asks to match the website, inspect the relevant web files and preserve shared behavior or copy that matters. Adapt layout and interaction where native conventions, accessibility, performance, or the established mobile design system benefit. Exact parity is required only when the user says so.

## Shared business logic

- Keep `src/core/domain` and `src/core/application` free of React Native, Expo, Next.js, DOM, and browser globals. `npm run check:core` enforces this boundary.
- Put storage, downloads, audio, permissions, native APIs, and other platform concerns behind implementations in `src/core/infrastructure`.
- Business logic that should serve both products belongs in the shared core even when the feature originates on mobile.
- The current sync mechanism treats `../quran-app/src/{domain,application}` as the canonical copy. Make cross-product shared-core changes there, then run `npm run sync:web-core`. This is a code-distribution constraint, not a requirement for mobile product or UI parity.
- Keep genuinely mobile-only orchestration outside the synced directories rather than forcing it into the website.

## Quality bar

- Treat Quran text, verse addressing, translations, tafsir attribution, and religious-data integrity as correctness-critical.
- Account for loading, empty, error, retry, and offline states where applicable.
- Preserve dark mode, RTL text behavior, screen-reader semantics, reduced motion, and usable touch targets.
- Prefer scoped changes. Refactor adjacent code when it is necessary for a coherent implementation, not as unrelated cleanup.
- Add or update tests in proportion to the behavioral risk.
- Update documentation only when it records a durable product decision, architecture, reusable component, data format, or operational workflow.
- Finish implementation work with `npm run verify`.

## Established mobile patterns

- Reader settings: `components/reader/settings/SettingsSidebar.tsx`
- Verse actions: `components/surah/VerseActionsSheet.tsx`
- Separated verse layout: `components/surah/VerseCard.tsx`
- Component inventory: `docs/components.md`
- Mobile design system: `docs/design-tokens.md`

These are starting points, not immutable templates.

## Modal layout gotcha

Some React Native modal sheets collapse to nearly zero height when their content uses `flex: 1`. Give the sheet explicit numeric `minHeight`/`maxHeight` values derived from `useWindowDimensions()` (see `components/bookmarks/planner/CreatePlannerModal.tsx`). Do not rely on percentage height strings for these sheets.
