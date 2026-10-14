# Download Hosting and Migration

Last audited: 2026-10-13

## Release status

The versioned data-pack bundle is complete and internally verified for migration to an object-storage or standard HTTP host. It is not suitable for GitHub Pages: the referenced assets total 1,304.2 MiB before repository history and Pages files, while the current `gh-pages` tree is already 591.9 MiB.

The application is not yet ready for public release solely on the strength of this asset audit:

- Chapter recitation metadata and files still come from Quran Foundation's QDC API/CDN. Word-pronunciation clips still come from `audio.qurancdn.com`. These are intentionally outside the data-pack bundle and require a separate hosting/permission decision.
- The optional Arabic grammar pack remains a development artifact until redistribution permission and qualified Quranic Arabic review are recorded. Do not copy its catalog or database to a public production host before those gates are satisfied.
- The verb-reference candidate is intentionally not in a public catalog or the application asset graph because permission and qualified review are pending.
- Existing release-signing, physical-device, accessibility, and scholarly-review gates documented in `docs/word-study-release-notes.md` still apply.

The authoritative engineering checklist for content rights is `docs/permissions.md`. A technically valid pack is not approved for production distribution until its corresponding permission task is cleared there.

## Audited pack inventory

Run `npm run audit:download-packs` to repeat the checksum, size, row-count, catalog-completeness, and Mushaf-font checks.

| Category | Required packs | Referenced data |
| --- | ---: | ---: |
| Translations | 126 | 396.4 MiB |
| Word-by-word languages | 8 | 108.6 MiB |
| Tafsirs | 20 | 264.5 MiB |
| Mushaf editions | 6 | 460.2 MiB |
| Word Study Essentials | 1 | 26.3 MiB |
| Word grammar development pack | 1 | 15.1 MiB |
| Dictionary packs | 2 | 32.9 MiB |
| Total | 164 | 1,304.2 MiB |

The six current Mushaf entries include the Tajweed `v4-ttf` pack and all 604 required fonts. The obsolete fontless Tajweed `v4` entry is excluded from the migration catalog. Application interface languages are bundled source data, not separate downloads.

## GitHub staging snapshot

The current `origin/gh-pages` branch is incomplete:

| Category | GitHub | Required |
| --- | ---: | ---: |
| Translations | 22 | 126 |
| Word-by-word languages | 8 | 8 |
| Tafsirs | 2 | 20 |
| Mushaf editions | 6 | 6, but Tajweed is the obsolete fontless version |
| Word Study Essentials | 1 | 1 |
| Word grammar | 1 | 1 development pack |
| Dictionaries | 2 | 2 |

Do not try to complete the pack set on GitHub Pages. Move the verified local `dist/*-packs` trees to the production host instead.

## Migration procedure

1. Run `npm run normalize:download-pack-urls`. Catalog asset locations must remain relative so one catalog base URL controls each category.
2. Run `npm run audit:download-packs`; do not upload if it reports any error.
3. Upload the approved category directories without changing their internal paths or bytes. Exclude the grammar pack until its release gates are satisfied.
4. Serve JSON, SQLite, font, and audio assets with correct `Content-Length`, MIME types, HTTPS, CORS for the intended clients, byte-range support for large files, and immutable caching on versioned paths. Keep catalog responses short-lived or explicitly invalidatable.
5. Replace the seven catalog URLs in `app.json` with their production-host equivalents. The relative asset URLs inside each catalog will resolve against the new catalog URL.
6. From a clean production-signed build, test install, cancel, retry, update, rollback, corruption handling, deletion, and offline use for every category. Include a five-simultaneous-download stress test on physical Android devices and, when applicable, iOS devices.
7. Repeat `npm run verify` and `npm run audit:download-packs` immediately before the release artifact is signed.

The runtime no longer falls back to live API downloads when a translation, tafsir, or Mushaf pack is absent from its configured host. A missing hosted asset now fails clearly. Remote native file transfers share a process-wide limit of five, while SQLite imports are serialized to avoid concurrent native write collisions.
