# Quran App Mobile - Agent Guidelines

This repo is an Expo (React Native) app intended to match the UI/UX of the web app in `../quran-app` (~90% parity) while keeping platform-native affordances where it improves usability.

## Quick commands

- Install: `npm install`
- Run: `npm run android` / `npm run ios`
- Type-check: `npm run type-check`
- Verify (recommended): `npm run verify`
- Sync shared core from web: `npm run sync:web-core` (defaults to `../quran-app`)

## Repo structure (source of truth)

- Routes/screens: `app/` (Expo Router file-based routing)
- Reusable UI components: `components/`
- **Shared core (synced from web)**:
  - `src/core/domain`
  - `src/core/application`
- **Mobile-only adapters/implementations** (keep platform-specific code here):
  - `src/core/infrastructure`
- Static data: `src/data/`

### Path aliases (important)

- `@/src/core/*` → `src/core/*`
- `@/src/*` → `src/core/*` (compat for synced imports from the web repo)
- `@/*` → repo root

Prefer `@/src/core/...` for new mobile-only code. Synced code from the web repo may use `@/src/...`.

## Guardrails for AI-driven development

- Keep `src/core/domain` + `src/core/application` platform-agnostic (no React Native/Expo/Next/browser globals). Enforced by `npm run check:core`.
- If you need to change shared logic, edit it in `../quran-app/src/{domain,application}` first, then run `npm run sync:web-core`.
- Put mobile-specific concerns (storage, audio, permissions, native APIs) behind interfaces in `src/core/infrastructure` and consume those from screens/hooks.

## UI parity workflow (when implementing a screen)

1. Find the matching web feature in `../quran-app/app/(features)/...` (check for a feature-level `README.md`/`AGENTS.md` there).
2. Reuse shared core logic when possible; extract missing logic into the web core before duplicating.
3. Prefer building/using reusable components in `components/` over one-off UI in screens.
4. Update `docs/ui-parity.md` when adding screens or changing parity targets.
5. Run `npm run verify` before handing off.

## AI parity contract (required)

When a task says “match the web app” / “same as web”:

- Start by listing the **exact web source-of-truth files** you’re mirroring (paths in `../quran-app/...`).
- Reuse first: search for existing **mobile** components/providers/hooks and extend them before creating new patterns.
- Keep UI copy + menu item order **identical to web**. Do not rename labels (ex: “Pin / bookmark”, “Add to plan”) unless the web changed.
- If an action/feature isn’t implemented yet, keep the UI and make it a **stub** (disabled row or “coming soon”). Do **not** remove web actions for convenience.
- Keep changes scoped to the feature: avoid “cleanup” refactors across unrelated screens.
- Avoid introducing new libraries unless the web app uses the same capability and it’s required for parity (justify in the PR notes/doc).
- Update docs as part of the change:
  - `docs/ui-parity.md` (parity target + notes)
  - `docs/components.md` (if you add reusable components)
- Always finish with `npm run verify`.

## Reusable UI patterns (reuse these, don’t reinvent)

- Right-side settings drawer: `components/reader/settings/SettingsSidebar.tsx`
- Verse actions bottom sheet: `components/surah/VerseActionsSheet.tsx`
- Separated verse layout: `components/surah/VerseCard.tsx`

## Modal layout gotcha (important)

Some RN modals can appear as “black overlay + thin grey line” when the modal sheet collapses to ~0 height.

- If the modal content uses `flex: 1` (e.g. `SafeAreaView`/inner wrappers), ensure the sheet has explicit numeric height constraints (`maxHeight`/`minHeight`) derived from `useWindowDimensions()` (see `components/bookmarks/planner/CreatePlannerModal.tsx`).
- Avoid relying on percentage strings for `maxHeight`/`minHeight` in these sheets.

---

# Skills

## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.

### Available skills

- skill-creator: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: C:/Users/yasin/.codex/skills/.system/skill-creator/SKILL.md)
- skill-installer: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: C:/Users/yasin/.codex/skills/.system/skill-installer/SKILL.md)

### How to use skills

- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1) After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2) When `SKILL.md` references relative paths (e.g., `scripts/foo.py`), resolve them relative to the skill directory listed above first, and only consider other paths if needed.
  3) If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  4) If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  5) If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.
