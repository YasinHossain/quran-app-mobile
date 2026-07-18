# AI Implementation Workflow

This is a lightweight workflow for product work in the mobile app. `AGENTS.md` contains the binding repository guidance; this document is a practical checklist, not an additional set of hard rules.

## 1. Understand the outcome

- Identify the user-visible goal and the behavior that makes it successful.
- Inspect the target screen, its nearby components, and the data path it already uses.
- Note correctness-sensitive states: loading, empty, error, offline, RTL, accessibility, and navigation return behavior.
- Use the sibling website only when it contains relevant business logic, content, terminology, or a design reference requested by the user.

## 2. Choose the right boundary

- Put reusable business rules in the platform-agnostic shared core.
- Keep native storage, downloads, audio, permissions, device APIs, and platform UI outside the shared core.
- Reuse an existing mobile component when it fits; extend or replace the pattern when the product benefits.
- Prefer a small reusable primitive over duplicating substantial UI or behavior across screens.

## 3. Design for mobile

- Start from the established mobile design system and semantic tokens.
- Choose interaction patterns based on touch, screen size, safe areas, keyboard behavior, gestures, and assistive technology.
- Preserve consistency across related flows without requiring website-shaped layouts.
- If the website is referenced, separate what should be shared—business rules, terminology, data contracts—from what may be mobile-specific—layout, navigation, interaction, and presentation.

## 4. Implement and verify

- Keep the change focused while making any adjacent refactor genuinely required by the implementation.
- Test behavior with risk-appropriate automated coverage.
- Inspect important visual or interaction changes on a representative device or emulator when available.
- Run `npm run verify` before handoff.

## 5. Document durable decisions

Update documentation only when the work changes one of these:

- a reusable component or design token;
- an architectural boundary or shared contract;
- a data pack, build, release, or operational workflow;
- a lasting product decision that future work needs to understand.

Routine feature work does not require a parity table or documentation ceremony.

## Definition of done

- The requested mobile outcome works, including relevant failure and offline states.
- Shared and mobile-only code remain in their correct boundaries.
- Accessibility, RTL, dark mode, and native behavior were considered where relevant.
- Tests and `npm run verify` pass, or any environment-only limitation is reported clearly.
