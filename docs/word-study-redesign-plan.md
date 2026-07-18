# Word Study Full-Screen Redesign Plan

Status: Approved product direction; Phase 1 implemented on 2026-07-18, with later phases pending.

This plan redesigns the full Word Study route without redesigning the Surah reader quick sheet. The goal is to give the selected word its complete ayah context, remove repeated information, and keep beginner help available without displaying the same definitions for every word.

There is no current web Word Study UI to mirror. The mobile full-screen product contract is the source of truth for this work.

## Source-of-truth files

- Full Word Study route: `app/study/word/[surah]/[ayah]/[position].tsx`
- Shared segmented-word presentation: `components/word-study/WordSegmentsCard.tsx`
- Full-screen presentation model: `components/word-study/full-study/wordStudyScreenModel.ts`
- Surah-reader preview that must not regress: `components/word-study/WordQuickSheet.tsx`
- Word Study domain contract: `src/core/domain/word-study/WordStudy.ts`
- Word Study repository mapping: `src/core/infrastructure/word-study/SQLiteWordStudyRepository.ts`
- Core morphology compiler: `scripts/word-study-pack/compiler.cjs`
- Full-screen tests: `tests/word-study-screen/word-study-screen.test.cts`
- Existing product record: `docs/word-study-feature-plan.md` and `docs/word-study-progress.md`

If implementation requires a shared domain or application change, make that change in `../quran-app/src/{domain,application}` first and run `npm run sync:web-core`. Keep React Native presentation and local-pack access in this mobile repository.

## Final product decisions

### Full ayah replaces the word ribbon

The top of the full study screen will show the ayah as naturally wrapping Arabic text. Every supported Quran word is tappable. Selecting a word updates the canonical `position` route parameter without pushing another screen or losing the active tab.

The ayah is presented as unboxed, full-width Quran text with slightly larger type and modest spacing between tappable words. It has no instructional label above it. The selected-word treatment remains deliberately minimal so the ayah continues to read as connected Quran text:

- change the selected word from the normal text color to the project's deep emerald accent;
- animate the previous word back to its normal color while the new word changes to emerald;
- do not add a card, chip, background fill, border, underline, or other dash beneath the selected word;
- use the theme's accessible emerald/accent variant in dark mode rather than hard-coding the light-theme deep emerald;
- use the existing motion system, keep the transition brief and responsive, and disable the movement in favor of an immediate state change when reduced motion is enabled.

Selection must not rely on emerald color alone. Each tappable word exposes `accessibilityState={{ selected: true }}` when active, and the analysis changes immediately on tap without waiting for the visual animation to finish.

For a short or medium ayah, show the complete ayah without an expansion control. For a long ayah:

- constrain the collapsed presentation to a small number of readable lines;
- show a single, comfortably sized down chevron at the lower-right edge;
- expand to the complete ayah when pressed;
- change the control to a single up chevron while expanded;
- preserve the selected word and current tab when expanding or collapsing;
- smoothly ease the ayah viewport height when expanding or collapsing and slide selected-centered collapsed windows instead of jumping between line groups;
- measure long ayahs inside a hidden compact viewport so first entry never flashes the full ayah before collapsing;
- never ship a collapsed state in which the selected word is hidden. Use measured layout, a selected-centered collapsed window, or default to expanded when necessary.

The Arabic text remains independently RTL even when the application language is LTR. The verse-end marker, if displayed, is not a selectable word.

The following current controls are removed:

- horizontal word-card ribbon;
- `Previous word` and `Next word` buttons;
- `Word X of Y` counter.

Visual previous/next controls are unnecessary once the ayah itself is the selector. Preserve equivalent nonvisual accessibility actions for moving to the previous or next word where supported.

### Overview is removed

Remove the `Overview` tab. Its surface form and primary part of speech repeat the selected Arabic word and colored segment labels. Lemma, root, and contextual meaning remain useful but do not justify a separate tab.

The resulting tab order is:

1. Morphology
2. Grammar
3. Occurrences
4. Dictionary

Morphology becomes the default tab.

### Morphology content order

The Morphology tab uses this order:

1. Selected Arabic word rendered with its sourced segment colors and text labels.
2. `Meaning in this ayah` contextual word translation.
3. Compact Lemma and Root values.
4. `How this word is built` heading.
5. Prefix, stem, suffix, infix, or whole-word cards, as applicable.
6. A bottom help row labeled `Understanding morphology terms`.

Do not render a standalone `Surface form` field. The selected word is already visible in the ayah and segmented-word presentation.

Part of speech must continue to use both a readable label and color. Color is a secondary visual aid and must never be the only representation. The existing broad color groups such as verb, noun, pronoun, and particle remain acceptable; the written label communicates specific types such as preposition or conjunction.

### Each morphology value appears once

Remove the `Features at this location` section.

The current compiler stores the primary stem's structured features on both the stem morpheme and the whole-word record. Rendering the segment details followed by the whole-word details therefore repeats aspect, voice, person, gender, number, case, state, form, or derivation. The second rendering is not a separate source or deeper analysis.

Render every value only on the segment to which it belongs:

- prefix card: conjunction, preposition, article, or other attached prefix role;
- stem card: its part of speech and applicable morphology values;
- suffix card: attached pronoun or inflection information when sourced;
- whole-word card: the analysis once when the source represents the word as one segment.

If a future source supplies a genuinely distinct word-level feature, render only fields that are not already present on a segment. Do not restore an unconditional summary section.

### Repeated teaching copy moves into a guide

Remove the fixed explanatory sentence beneath every segment type and morphology field. Examples of fixed copy include explanations of Aspect, Voice, Person, Prefix, Stem, Suffix, and Whole word. The label and current value remain visible, including the Arabic technical term.

Also remove the current bottom notice beginning `Morphology describes how this word is formed...`.

At the bottom of the Morphology content, add one quiet navigation row:

`Understanding morphology terms`

The row uses an information icon and a trailing chevron. It opens an explicitly height-constrained bottom sheet containing:

- prefix, stem, suffix, infix, and whole-word definitions;
- aspect, mood, voice, person, gender, and number definitions;
- case, state, verb form, and derivation definitions;
- Arabic technical terms and short examples where they improve understanding.

The guide is help content, not another study destination, so it must not become a fifth tab. Follow the repository modal guidance: derive an explicit numeric height from `useWindowDimensions()` so the sheet cannot collapse.

### Contextual meaning and language behavior

The contextual word translation appears immediately after the segmented Arabic word so the user can understand the analyzed form while studying its parts.

Use the user's selected word-by-word language when an installed word pack can supply the same location. Fall back to the bundled English contextual gloss when the selected language is unavailable. Do not silently display an English value as though it were the selected language; use the application's established language/fallback presentation.

Language integration must reuse the existing offline word-language pack and settings infrastructure. Do not add a network-only dependency to Word Study.

### Sources move out of the analysis flow

Remove the large `About this analysis` card from the word content.

Create a dedicated `Word Study Sources` destination reachable from the application's settings/about area. It contains source titles, versions, attribution, methodology boundaries, external links, and relevant pack information. Reuse the existing source metadata rather than hard-coding a second source ledger in UI components.

Do not combine this with `Understanding morphology terms`:

- the morphology guide explains terminology;
- Word Study Sources explains provenance, versions, rights, and analytical limits.

Individual dictionary definitions retain their own citations where source identity affects the content. Existing attributed sharing should remain attributed.

## Out of scope

- Redesigning the Surah-reader Word Study quick sheet.
- Changing QAC annotations or generating new morphology.
- Adding a second morphology source.
- Redesigning Grammar, Occurrences, or Dictionary content beyond adapting to the new common header/tab structure.
- Adding a new UI library.
- Changing word-audio behavior.

## Implementation phases

Each phase should be independently reviewable and end with passing relevant tests plus `npm run verify`. Preserve unrelated work already present in the working tree.

### Phase 1: Ayah context selector and navigation

Replace `WordRibbon` and `AdjacentNavigation` with a reusable full-ayah word selector.

Work:

- Render ordered ayah words as wrapping, independently RTL Arabic text.
- Make each supported word a sufficiently large accessible press target without breaking Quran word spacing or shaping.
- Render the route-selected word only in the theme's emerald accent, without a surrounding box or underline.
- Animate the text color between selections and respect reduced-motion settings.
- Update selection through `router.setParams({ position })` so back navigation and the reader instance remain intact.
- Add measured long-ayah collapse/expand behavior and a right-aligned single-chevron control.
- Guarantee selected-word visibility in collapsed mode.
- Add accessible selected state, word-position labels, expand/collapse state, and previous/next accessibility actions.
- Remove the ribbon, adjacent buttons, counter, related constants, and unused icons/styles.

Acceptance criteria:

- A short ayah displays fully with no expansion control.
- A long ayah displays a compact context and can reveal the complete ayah.
- Early, middle, and late selected words are visible in the collapsed long-ayah state.
- Tapping any displayed word updates analysis without adding navigation history.
- The selected word uses emerald text without a box, background fill, underline, or dash, and the transition never disturbs Arabic shaping or delays selection.
- Changing words preserves the active tab.
- Stack back returns to the same reader position.
- No visible previous/next controls or word counter remain.

Recommended manual fixtures include a short ayah, a normal multi-line ayah, and Al-Baqarah 2:282 with selections near its beginning, middle, and end.

### Phase 2: Information architecture and morphology deduplication

Remove Overview and make Morphology a concise, nonduplicated default study view.

Work:

- Remove `overview` from the tab state and tab list.
- Make Morphology the initial tab.
- Move contextual meaning, compact lemma, and compact root to the beginning of Morphology after the segmented Arabic word.
- Remove standalone Surface form and primary POS presentation from the full screen.
- Keep specific POS labels on segment cards.
- Remove the unconditional whole-word `Features at this location` rendering.
- Ensure one-segment words still render their applicable features once.
- Ensure multi-segment words show prefix/stem/suffix roles and each sourced value once.
- Remove fixed inline teaching sentences while retaining field labels, Arabic technical terms, and current values.
- Remove the bottom morphology-versus-grammar scope notice.
- Remove code, imports, styles, and model helpers that become unused; do not refactor unrelated tabs.

Acceptance criteria:

- Tabs read `Morphology`, `Grammar`, `Occurrences`, `Dictionary` in that order.
- Morphology is selected on first entry.
- Contextual meaning, lemma, and root are available without an Overview tab.
- Surface form and primary POS are not separately repeated.
- A verb does not show aspect, voice, person, gender, number, or verb form twice.
- A noun/adjective does not show case or state twice.
- Prefix and suffix information remains visible when present.
- Missing lemma/root states remain explicit rather than blank.
- Grammar, Occurrences, and Dictionary behavior is unchanged.

### Phase 3: Terminology guide and source relocation

Add progressive-disclosure help and move provenance out of the main analysis scroll.

Work:

- Add the bottom `Understanding morphology terms` row.
- Build a reusable, accessible morphology-guide bottom sheet with explicit numeric height constraints.
- Move the existing static definitions into the guide, grouped by Segments and Features.
- Remove `AboutAnalysis` and its card from the Word Study route.
- Add a dedicated Word Study Sources screen using existing source metadata and external links.
- Add a Settings/About entry for Word Study Sources without crowding the study screen.
- Retain citations inside Dictionary and attribution in Share.

Acceptance criteria:

- Normal morphology rows contain no repeated definition paragraphs.
- The help row is the final Morphology element and is understandable without relying on the icon alone.
- The guide opens, scrolls, closes, supports the back button, and does not collapse at any tested screen height.
- Screen readers announce the control as `Understanding morphology terms` or `Explain morphology terms`.
- No `About this analysis` card appears in the study content.
- Complete source/version information remains reachable from application settings.
- Dictionary citations and share attribution remain intact.

### Phase 4: Language integration, accessibility, regression testing, and docs

Finish the redesign by connecting contextual meaning to existing language preferences and hardening the complete flow.

Work:

- Resolve contextual meaning from the selected installed word-language pack where available.
- Provide a deterministic offline English fallback and expose fallback state using an established app pattern.
- Verify Arabic RTL independently from UI language direction.
- Verify focus order across header, ayah selector, tabs, morphology cards, and help row.
- Verify Dynamic Type/font scaling without clipping Quran text, selected highlight, values, or modal content.
- Add/update focused model and screen tests for removed duplication and the new information structure.
- Update `docs/components.md`, `docs/word-study-feature-plan.md`, and `docs/word-study-progress.md` where they record durable shipped behavior.
- Run the relevant Word Study physical-device checklist sections and record any remaining device-only work.

Acceptance criteria:

- Selected installed word language is used when its location is available.
- Offline fallback is predictable and not mislabeled.
- TalkBack/VoiceOver can select ayah words and identify the current selection without relying on color.
- Light/dark themes and enlarged fonts preserve readable layout.
- Tests assert that Overview, adjacent navigation, duplicate feature summary, fixed inline explanations, scope notice, and About card are absent.
- Tests assert that meaning, lemma/root, unique segment features, help access, and source access remain present.
- `npm run verify` passes.

## Suggested test matrix

Cover at least these word shapes:

- single-segment verb with aspect, voice, person, gender, number, and form;
- multi-segment verb with conjunction prefix and/or pronoun suffix;
- noun or adjective with grammatical case/state;
- rootless particle;
- proper noun with an intentionally absent root;
- word with missing morphology or segmentation;
- short ayah and exceptionally long ayah;
- selected word near the beginning, middle, and end of a long ayah.

Run visual/manual checks in:

- light and dark themes;
- LTR and RTL application languages where supported;
- normal and enlarged system font scales;
- Android TalkBack, and VoiceOver when iOS Word Study work resumes;
- offline mode with only bundled Word Study data;
- offline mode with a non-English word-language pack installed.

## Handoff constraints

- Keep changes scoped to the full Word Study redesign.
- Reuse existing components, settings, word-language packs, source metadata, and modal transition patterns.
- Do not introduce a new library without a documented requirement.
- Do not change or “correct” canonical Quran or QAC data as part of presentation cleanup.
- Do not remove information merely because it is unavailable for one test word; use the domain's explicit missing/unsupported states.
- Do not treat the current duplicated whole-word feature record as a second scholarly source.
- Finish every implementation phase with `npm run verify` before handing it off.
