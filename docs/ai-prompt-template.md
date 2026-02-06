# AI Prompt Template (Web → Mobile Parity)

Copy/paste this into a new chat when you want an AI to implement a feature with maximum parity and minimal “creative rewrites”.

---

## Context

You are working in the **mobile repo**: `quran-app-mobile` (Expo / React Native / NativeWind).

**Web source of truth repo** lives at: `../quran-app`

## Read first (required)

- `AGENTS.md`
- `docs/ai-workflow.md`
- `docs/ui-parity.md`
- `docs/ui-mapping.md`
- `docs/design-tokens.md`
- `docs/components.md`

## Task

Implement **[FEATURE NAME]** on mobile to match the web app (~90% parity).

### Web references (must list exact files)

- [WEB FILE 1]
- [WEB FILE 2]
- [WEB FILE 3]

### Mobile targets (must list exact files)

- [MOBILE FILE 1]
- [MOBILE FILE 2]
- [MOBILE FILE 3]

## Hard rules

- Reuse existing mobile components/providers/hooks; do not invent new patterns.
- Keep UI copy + menu action order identical to web (no renaming).
- If behavior isn’t implemented yet, keep the UI and stub it (disabled row or “coming soon”).
- Keep the change set scoped (no unrelated refactors).
- Finish with `npm run verify` passing.
- Update `docs/ui-parity.md` and `docs/components.md` if needed.

## Deliverable

- UI parity first (layout + interactions).
- Stubs are acceptable for missing features, but **do not remove** web actions/options.

