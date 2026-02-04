# UI Parity Roadmap

This document is the single source of truth for aligning mobile UI with the web experience. It defines what must match, what can diverge, and target parity levels per screen.

## Parity Table

| Web Feature | Web Path | Mobile Screen | Parity Target | Notes |
| --- | --- | --- | --- | --- |
| Surah page | /src/pages/Surah | app/surah | 90% | Allow native audio controls. |
| Juz page | /src/pages/Juz | app/juz | 85% | Keep typography scale consistent; layout may be native-scrolled. |
| Ayah detail modal | /src/components/AyahDetailModal | app/ayah-detail | 95% | Match content order; native sheet presentation is OK. |
| Search | /src/pages/Search | app/search | 90% | Match search filters and result cards; platform-specific input UX allowed. |
| Bookmarks | /src/pages/Bookmarks | app/bookmarks | 90% | Match list grouping and empty states; swipe actions allowed. |
| Settings | /src/pages/Settings | app/settings | 80% | Core toggles must match; platform-specific system settings entry allowed. |

## Parity Targets

- **95–100%**: Must match layout, content order, and interactions; only platform-specific affordances allowed.
- **90–94%**: Minor visual or interaction differences allowed if they improve native usability.
- **80–89%**: Feature set must match, but layout can be adapted to native patterns.
- **Below 80%**: Requires explicit approval and documentation of why it diverges.

## Notes

- When adding new screens or features, update this table first.
- Any intentional divergence must be documented in the Notes column with rationale.
