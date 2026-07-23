# Welcome Screen and Initial Resource Setup

## Product goal

Make first launch quick and understandable for users of every age. The welcome screen exists only to help choose the application language and prepare a suitable default translation when possible. It must not feel like a required setup wizard or explain the internal resource system.

## Welcome screen

Use one minimal screen containing:

- Quran app identity or welcome artwork.
- A clear language selection control.
- One primary action such as **Start Reading**.

Do not show download explanations, fallback explanations, pack terminology, retry controls, or lists of optional resources on this screen.

The supported initial UI languages are:

- English
- Bangla
- Arabic
- Urdu
- Hindi

The device language may be preselected when supported. Otherwise, select English.

## Initial translation behavior

Saheeh International ships with the application and is the guaranteed translation available after installation.

When the user completes the welcome screen:

1. Save the selected UI language.
2. Apply the website-defined default translation for that language.
3. If internet access is available, make one best-effort attempt to download that default translation.
4. If the download is unavailable, interrupted, or fails, continue into the app silently with bundled Saheeh International.

The initial setup must not:

- Block entry while waiting for the language translation.
- Display a fallback notice.
- Schedule automatic background retries.
- Repeatedly prompt the user.
- Force the user to resolve a failed download.

If the preferred translation was not installed during setup, the user can install it later from Downloads or translation management.

### Language defaults

| UI language | Preferred translation |
| --- | --- |
| English | Saheeh International (20), already bundled |
| Bangla | Taisirul Quran (161) |
| Hindi | Maulana Azizul Haque al-Umari (122) |
| Urdu | Maulana Muhammad Junagarhi (54) |
| Arabic | No additional translation; retain the bundled fallback where translation text is needed |

These defaults apply during initial setup. Changing the UI language later must not silently replace a user's established translation selections.

## Selecting translations later

Installed translations can be selected immediately.

When a user selects an uninstalled translation, show a small bottom sheet with two choices:

- **Download** — install and select the translation for offline use.
- **Continue online** — select it without downloading and load it from the network when available.

Canceling the sheet leaves the current translation selection unchanged. The initial language setup does not show this sheet because its download attempt is silent.

## Mushaf behavior

Remove the bundled Uthmani Unicode mushaf and remove it from the visible mushaf choices. The application starts without an installed page-layout mushaf.

When a user attempts to switch to Mushaf/Page reading without an installed mushaf:

1. Do not navigate to or render an empty Mushaf page.
2. Keep the current reader usable.
3. Open the settings sidebar directly on the Manage Mushaf panel.
4. Preserve the existing mushaf previews and download actions so the user can choose the desired layout.
5. Show a brief bottom message explaining that a mushaf must be downloaded for page reading.

After a mushaf installs successfully, select it and open Mushaf reading at the corresponding location. If installation is canceled or fails, remain in the existing reader without changing reading mode.

Implementation must remove the current assumption that `unicode-uthmani-v1` is always installed or is the default mushaf. A no-installed-mushaf state must be represented explicitly.

## Tafsir behavior

Tafsir remains download-only.

When no tafsir is selected or installed, the Tafsir section shows a purposeful **Add Tafsir** action instead of an empty content area. Pressing it opens the settings sidebar directly on Manage Tafsirs.

A tafsir must be downloaded before it can be selected. After installation, select it and display it for the ayah the user was viewing. Deleting the last installed or selected tafsir returns the screen to the **Add Tafsir** state.

## Word-by-word

Word-by-word onboarding and resource behavior are intentionally outside the scope of this plan. They will be designed and implemented separately. The welcome screen must not add word-by-word prompts or downloads.

## Required bundled-resource work

Saheeh International is currently configured as the default and its generated pack exists in `dist/translation-packs`, but it is not yet bootstrapped as an installed bundled translation. Implementation must:

- Include the Saheeh International payload in the application bundle.
- Import it into offline storage on first startup.
- Register it as installed in the download index.
- Avoid downloading it again for English initial setup.
- Preserve Quran text and verse-address integrity during import.

Removing Uthmani Unicode must also remove its payload from the application bundle and update bootstrap, defaults, settings normalization, and reader assumptions accordingly.

## Acceptance criteria

- First launch uses a single, minimal language screen.
- Completing setup always enters the app without waiting for optional network work.
- Saheeh International is readable offline on a fresh installation.
- A supported non-English language receives one silent initial download attempt when online.
- A failed initial translation download produces no prompt, notice, or automatic retry.
- An uninstalled translation selected later offers **Download** and **Continue online**.
- Entering Mushaf mode without an installed mushaf opens Manage Mushaf and never shows an empty page.
- No Uthmani Unicode mushaf remains bundled or selectable.
- Tafsir without an installed selection shows **Add Tafsir** and opens Manage Tafsirs.
- No word-by-word setup is added by this work.

