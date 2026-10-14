# Content Permissions and Release Rights

Last reviewed: 2026-10-14

This is the central rights checklist for content that the application bundles, stores offline, or distributes from its own download host. Public availability, an open-source software repository, or an unauthenticated CDN URL does not by itself grant rights to copy and redistribute the associated text, database, recording, or other media.

This record is an engineering release gate, not legal advice. Store permission correspondence outside the repository when it contains private information, but record its date, parties, covered artifact/version, allowed uses, attribution, expiration, and evidence location here.

Status meanings:

- **Blocked**: do not publish, permanently cache, bundle, or self-host the content.
- **Evidence required**: the product owner has reported permission or the source appears usable, but release evidence does not identify the exact artifacts and allowed uses.
- **Conditional**: published terms permit only the stated implementation and conditions.
- **Cleared**: written evidence covers the exact shipped artifact and distribution model.

## Open permission tasks

### P-01 — Dedicated word-pronunciation audio

Status: **Blocked for permanent offline storage and self-hosting.** Current streaming playback may continue under the applicable Quran Foundation terms.

Source in the app: `https://audio.qurancdn.com/wbw/{surah}_{ayah}_{word}.mp3`.

- [ ] Obtain written confirmation covering the complete `wbw/*.mp3` collection used by the app.
- [ ] Confirm that Quran Foundation has authority to grant the requested rights for the recordings and identify any separate reciter/producer rights.
- [ ] Obtain permission for indefinite storage in private Android and iOS application storage.
- [ ] Obtain permission to copy the MP3s to the application's production server/CDN.
- [ ] Obtain permission to package the files into downloadable Surah/Juz archives distributed only through the application.
- [ ] Confirm free, donation-supported, subscription, and other commercial-app use as applicable.
- [ ] Confirm whether filenames may be changed and whether lossless repackaging, checksums, compression, or metadata changes are allowed. Do not edit the recitation audio without explicit permission.
- [ ] Record required Quran Foundation, reciter, studio, and source attribution.
- [ ] Record correction, replacement, deletion, revocation, and update obligations.
- [ ] Record whether the production host may expose direct asset URLs or must require an authenticated application request.
- [ ] Attach or reference the signed response in the release record before implementing permanent offline packs.

Requested scope:

> Permission for Quran App Mobile to download, indefinitely store on user devices, package, redistribute, and self-host the dedicated Quran Foundation word-pronunciation files currently served below `https://audio.qurancdn.com/wbw/`, solely as an integrated Android/iOS application feature. The proposed distribution is versioned downloadable Surah/Juz packs with checksums, offline playback, deletion, and updates. Please confirm covered recordings, commercial-use status, required attribution, permitted technical repackaging, correction/update obligations, and whether any additional reciter or producer permission is required.

Until cleared, the app must either stream the word clip or use an automatically expiring cache that complies with the current Quran Foundation storage limit. The published Developer Terms currently restrict long-term storage unless an applicable Content Sync exception or separate authorization exists; the documented font and Mushaf-image exception does not establish permission for word-audio MP3 files.

Authoritative references:

- https://api-docs.quran.foundation/legal/developer-terms/
- https://api-docs.quran.foundation/docs/sdk/javascript/audio/

### P-02 — Chapter and ayah recitation audio

Status: **Blocked pending exact long-term storage and redistribution coverage.** The application currently supports persistent chapter-audio downloads, so this must be resolved even if word-audio packs are deferred.

- [ ] Inventory every selectable reciter, recitation ID, recording source, CDN hostname, and attribution.
- [ ] Confirm indefinite on-device offline storage rights for each recording.
- [ ] Confirm whether the application may mirror/self-host each recording or must retain source-CDN delivery.
- [ ] Confirm that Content Sync coverage for recitation metadata and timing rows does not get mistaken for permission to copy the underlying MP3 binaries.
- [ ] Record commercial-use, attribution, modification, clipping, waveform, timing, correction, and takedown terms per recording.
- [ ] Remove or disable any reciter whose exact recording rights cannot be established before release.

### P-03 — Translation and word-by-word language packs

Status: **Evidence required.** The product owner recorded confirmation of canonical translation/Mushaf offline rights on 2026-07-16, but the correspondence is outside the repository and the generated translation manifests do not contain standalone license or attribution fields.

- [ ] Attach/reference the 2026-07-16 permission evidence and identify the exact covered resources.
- [ ] Map all 126 translation IDs and all 8 word-by-word language packs to their translator/publisher, source version, license or written grant, attribution, modification limits, and offline/self-hosting rights.
- [ ] Confirm that permission covers conversion into the app's JSON format, permanent device storage, production-server hosting, and downloadable application packs.
- [ ] Confirm update/correction and withdrawal requirements for every edition.
- [ ] Confirm the bundled Saheeh International/Verse Spotlight copy separately; its current upstream manifest does not declare a standalone translation license.

### P-04 — Tafsir packs

Status: **Blocked for public self-hosting until edition-level rights are recorded.** The 20 generated manifests identify Quran Foundation API sources but do not declare standalone license or attribution terms.

- [ ] Map every tafsir ID to the author, publisher/rightsholder, edition/version, source, and required attribution.
- [ ] Obtain or document permission for format conversion, permanent offline storage, and distribution from the application's server.
- [ ] Record whether HTML cleanup or other presentation transformation is permitted.
- [ ] Record correction, edition replacement, and takedown obligations.
- [ ] Exclude any tafsir whose exact edition rights are unresolved.

### P-05 — Mushaf data, fonts, and rendering assets

Status: **Conditional and evidence required.** The product owner reported canonical Mushaf offline rights, while Quran Foundation's published terms separately permit qualifying font/Mushaf-image use only under stated account, attribution, integration, and distribution conditions.

- [ ] Attach/reference the permission evidence covering the six current Mushaf editions and their exact data/font versions.
- [ ] Maintain the required active Quran Foundation Developer Console account.
- [ ] Add and verify the required Quran Foundation credit in an accessible application location.
- [ ] Confirm that serving versioned fonts and Mushaf assets from the application's download host is permitted as an integrated app download and is not treated as a prohibited standalone asset package.
- [ ] Record the required refresh/invalidation process for corrected fonts or Mushaf data.
- [ ] Preserve exact Quran text and verify every release checksum before publication.

### P-06 — Word Study Essentials / Quranic Arabic Corpus morphology

Status: **Evidence required; product-owner confirmation exists.** The product owner reported on 2026-07-16 that written conversion and offline-redistribution permission was settled, but the correspondence remains outside the repository.

- [ ] Attach/reference the permission evidence covering QAC v0.4 and the generated SQLite schema/version.
- [ ] Verify that normalization, SQLite conversion, derived occurrence indexes/counts, Android/iOS distribution, hosted updates, and source-delivery obligations are covered.
- [ ] Preserve required QAC attribution, copyright notices, source/version metadata, and change notices.
- [ ] Retain qualified Quranic Arabic review as a separate release approval.

### P-07 — Arabic grammar pack

Status: **Blocked.** The `qac-irab` database is a development artifact and must not be placed in the public production catalog until both rights and scholarly review are complete.

- [ ] Obtain written redistribution permission for the exact `quran_irab_v1.4.zip` content and the generated SQLite derivative.
- [ ] Confirm parsing, markup removal, indexing, selected-word matching, permanent offline storage, and hosted application downloads are permitted.
- [ ] Record required author/project/publisher attribution and source-delivery obligations.
- [ ] Complete qualified Quranic Arabic review and disputed-record handling.

### P-08 — Dictionary packs

Status: **Evidence required.** Repository source-code licenses do not automatically establish rights to redistribute the underlying Lane and Hans Wehr dictionary databases or copyrighted editions.

- [ ] Establish the public-domain/copyright status of the exact Lane edition and digitized database.
- [ ] Establish redistribution and derivative-database rights for the exact Hans Wehr edition and digitized database.
- [ ] Confirm permission for Quran-focused extraction, sanitization, SQLite conversion, permanent offline storage, and hosted downloads.
- [ ] Record edition-specific attribution and source notices in the manifests and application.
- [ ] Remove any dictionary pack whose exact content rights cannot be documented.

### P-09 — Verb-reference candidate

Status: **Blocked.** The candidate is correctly excluded from the public catalog and application asset graph.

- [ ] Obtain written permission for the exact source database and its six principal-part fields.
- [ ] Confirm normalization, de-duplication, SQLite conversion, permanent offline storage, and hosted distribution rights.
- [ ] Record attribution, version, checksums, modification terms, and correction obligations.
- [ ] Complete qualified Quranic Arabic review before enabling the UI or publishing the pack.

## Release decision checklist

- [ ] Every public pack has an exact artifact/version, checksum, source, rightsholder, license/grant, attribution, modification scope, offline-storage scope, server-hosting scope, commercial-use status, and update/takedown process.
- [ ] Permission evidence covers Android, iOS, production CDN/server delivery, downloadable updates, and all intended business models.
- [ ] Open-source software licenses are not used as evidence for separately sourced content or media.
- [ ] Quran Foundation Content Sync permissions and obligations are recorded separately from rights to copy underlying audio/font/media binaries.
- [ ] Blocked content is absent from production catalogs and cannot be reached through a runtime fallback.
- [ ] Required credits and source notices are visible in the production application.
- [ ] Qualified scholarly review is complete for morphology, grammar, verb-reference, and other correctness-critical derived content.
- [ ] The final production catalogs pass `npm run audit:download-packs` after blocked packs are excluded.

## Cleared or app-owned material

Application code, UI copy, schemas, catalog formats, download orchestration, checksums, and other original engineering work are governed by the repository's own applicable license and contributor agreements. This does not extend to third-party Quran text editions, translations, tafsirs, dictionaries, linguistic annotations, recitation recordings, fonts, or other supplied content.

