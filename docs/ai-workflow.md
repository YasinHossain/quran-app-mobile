# AI Workflow Checklist: Web Page → Mobile Screen (Shared Core Logic)

Use this checklist to convert a web page into a mobile screen while reusing shared core logic and minimizing duplication.

## Non‑negotiables (for “match the web app” tasks)

- Treat the web repo (`../quran-app`) as the **source of truth** for UX, copy, and action ordering.
- **List exact web reference files first** (paths), then map them to the intended mobile files.
- Reuse before creating: search for existing mobile components/providers/hooks and extend them.
- If a web feature isn’t implemented yet, keep the UI and stub the behavior (disabled row or “coming soon”). Don’t remove actions for convenience.
- Keep the change set small: avoid unrelated refactors.
- Run `npm run verify` before handoff.

## 1) Intake & scope
- [ ] Identify the source web page (route/path) and the target mobile screen name.
- [ ] List the user-facing goals and primary actions for the screen.
- [ ] Capture required data sources, APIs, and shared modules used by the web page.
- [ ] Define what must be identical across platforms (business rules, validation, formatting) vs. what can diverge (layout, navigation patterns).

## 2) Web reference map (required)

- [ ] List the web source-of-truth files (components/hooks) you will mirror.
- [ ] Map each web piece to a mobile file (or an existing mobile component to reuse).
- [ ] If this screen is not in `docs/ui-parity.md`, add it (or update Notes/parity target).

## 3) Shared core logic audit
- [ ] Locate existing shared logic modules (e.g., data fetching, selectors, view models, utilities).
- [ ] Confirm platform-agnostic logic boundaries (no DOM/web-only dependencies).
- [ ] Extract/relocate logic into shared modules if it currently lives in web-only code.
- [ ] Document required inputs/outputs for the shared logic.

## 4) Mobile requirements mapping
- [ ] Map web UI sections to mobile screen components and layout patterns.
- [ ] Decide navigation entry points (stack/tab/modal) and route params.
- [ ] Define responsive behavior for small screens (scrolling, stacking, collapsible sections).
- [ ] Identify platform-specific UX needs (safe areas, gesture patterns, keyboard behavior).

## 5) Data flow & state planning
- [ ] Outline the data flow from shared logic into the mobile screen (props/hooks/store).
- [ ] Identify loading, error, and empty states.
- [ ] Specify caching, pagination, or refresh behaviors.
- [ ] Confirm analytics or logging hooks needed on mobile.

## 6) Implementation steps
- [ ] Create the new mobile screen route and file structure.
- [ ] Wire up shared logic (hooks/services/selectors) to provide data to the UI.
- [ ] Build UI components using shared or platform-native components as appropriate.
- [ ] Keep labels/copy aligned with web (don’t rename menu items).
- [ ] Prefer stubs/disabled UI over removing actions/features.
- [ ] Add accessibility labels and focus order adjustments for mobile.
- [ ] Ensure localization/RTL layout considerations match web behavior.

## 7) QA checklist
- [ ] Validate feature parity with the web page (business rules & outputs).
- [ ] Test loading, error, and empty states.
- [ ] Verify layout on multiple device sizes or simulators.
- [ ] Confirm navigation flows and back behavior.
- [ ] Check performance (render cost, list virtualization where needed).

## 8) Documentation & handoff
- [ ] Update any relevant docs or READMEs with the new screen.
- [ ] Add notes on shared logic usage and limitations.
- [ ] Capture follow-up tasks or tech debt discovered during the conversion.

## Definition of done

- [ ] `npm run verify` passes
- [ ] `docs/ui-parity.md` updated (if parity targets/notes changed)
- [ ] `docs/components.md` updated (if reusable components were added)
