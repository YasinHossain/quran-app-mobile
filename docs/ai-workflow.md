# AI Workflow Checklist: Web Page → Mobile Screen (Shared Core Logic)

Use this checklist to convert a web page into a mobile screen while reusing shared core logic and minimizing duplication.

## 1) Intake & scope
- [ ] Identify the source web page (route/path) and the target mobile screen name.
- [ ] List the user-facing goals and primary actions for the screen.
- [ ] Capture required data sources, APIs, and shared modules used by the web page.
- [ ] Define what must be identical across platforms (business rules, validation, formatting) vs. what can diverge (layout, navigation patterns).

## 2) Shared core logic audit
- [ ] Locate existing shared logic modules (e.g., data fetching, selectors, view models, utilities).
- [ ] Confirm platform-agnostic logic boundaries (no DOM/web-only dependencies).
- [ ] Extract/relocate logic into shared modules if it currently lives in web-only code.
- [ ] Document required inputs/outputs for the shared logic.

## 3) Mobile requirements mapping
- [ ] Map web UI sections to mobile screen components and layout patterns.
- [ ] Decide navigation entry points (stack/tab/modal) and route params.
- [ ] Define responsive behavior for small screens (scrolling, stacking, collapsible sections).
- [ ] Identify platform-specific UX needs (safe areas, gesture patterns, keyboard behavior).

## 4) Data flow & state planning
- [ ] Outline the data flow from shared logic into the mobile screen (props/hooks/store).
- [ ] Identify loading, error, and empty states.
- [ ] Specify caching, pagination, or refresh behaviors.
- [ ] Confirm analytics or logging hooks needed on mobile.

## 5) Implementation steps
- [ ] Create the new mobile screen route and file structure.
- [ ] Wire up shared logic (hooks/services/selectors) to provide data to the UI.
- [ ] Build UI components using shared or platform-native components as appropriate.
- [ ] Add accessibility labels and focus order adjustments for mobile.
- [ ] Ensure localization/RTL layout considerations match web behavior.

## 6) QA checklist
- [ ] Validate feature parity with the web page (business rules & outputs).
- [ ] Test loading, error, and empty states.
- [ ] Verify layout on multiple device sizes or simulators.
- [ ] Confirm navigation flows and back behavior.
- [ ] Check performance (render cost, list virtualization where needed).

## 7) Documentation & handoff
- [ ] Update any relevant docs or READMEs with the new screen.
- [ ] Add notes on shared logic usage and limitations.
- [ ] Capture follow-up tasks or tech debt discovered during the conversion.
