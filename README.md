# Anime Vault - Smart Anime List Filter for Streaming Sites

> A browser userscript that connects your **AniList** or **MyAnimeList** library to any anime streaming site - automatically dimming or hiding titles based on their watch status.

<br>

## ✨ Features

- **Full library import** - fetches your entire anime list at once (Watching, Planning, Completed, Dropped, On Hold) in a single click
- **Per-status filtering** - independently toggle visibility for each status with a live switch; changes apply to the page immediately
- **Smart title matching** - uses Jaro-Winkler fuzzy matching to correctly identify titles even when site names differ slightly from your list
- **Dim opacity control** - slider to set how invisible hidden titles appear (subtle dimming or near-invisible)
- **Master on/off switch** - disable the entire filter instantly from the panel or FAB button without changing any settings
- **Floating settings panel** - a clean, non-intrusive `⬡` button in the corner opens a full settings panel without leaving the page
- **Persistent settings** - all preferences, library data, and the enabled state survive page reloads and browser restarts
- **SPA-aware** - works on single-page apps like Miruro with MutationObserver-based re-filtering on navigation
- **Reliable networking** - all API calls use `GM.xmlHttpRequest` directly, bypassing CORS completely, with automatic retry on failure or rate limiting

<br>

## 🌐 Supported Streaming Sites

| Site | Domain |
|------|--------|
| YugenAnime | `yugenanime.tv` · `yugenanime.sx` |
| GogoAnime / Anitaku | `gogoanime.tv` · `anitaku.pe` · `gogoanime3.co` |
| AnimePahe | `animepahe.si` |
| AnimeSuge | `animesuge.to` · `animesuge.cc` |
| Miruro | `miruro.tv` · `miruro.to` · `miruro.online` |
| AnimeKai | `animekai.to` |
| Animetsu | `animetsu.cc` |
| Kaido | `kaido.to` |
| Kuudere | `kuudere.to` |

<br>

## 📦 Supported Services

| Service | Notes |
|---------|-------|
| **AniList** | Default service. Fetches all 5 statuses in one import. |
| **MyAnimeList** | Full library import including alternative titles for better matching. |

<br>

## 🚀 Installation

1. Install a userscript manager in your browser:
   - [Tampermonkey](https://www.tampermonkey.net/) *(recommended)*
   - [Violentmonkey](https://violentmonkey.github.io/)

2. Click the install link below to add the script:

   > **[⬇ Install Anime Vault]([https://github.com/hamzaharoon1314/](https://github.com/hamzaharoon1314/Anime-Vault/raw/refs/heads/main/script.js))** *(see releases)*

3. Visit any supported streaming site.

4. Click the **`⬡`** button in the bottom-right corner.

5. Enter your **AniList** or **MAL** username and click **⟳ Import**.

<br>

## 🖥️ How to Use

### First-time Setup
1. Open the settings panel via the `⬡` FAB button
2. Select your service (AniList or MyAnimeList)
3. Type your username and hit **⟳ Import** - your full library is fetched and stored locally
4. Adjust the status toggles to choose what to show or hide

### Status Toggles
Each status has its own toggle switch:

| Status | Default |
|--------|---------|
| 🔵 Watching | ✅ Shown |
| 🟢 Plan to Watch | ✅ Shown |
| 🟣 Completed | 🚫 Hidden |
| 🔴 Dropped | 🚫 Hidden |
| 🟠 On Hold | ✅ Shown |

### Master Switch
The **`⏻`** power button in the panel header disables all filtering at once - every title returns to full brightness. The FAB turns red when the filter is off so you always know the current state at a glance.

### Re-importing
Your library auto-refreshes every **7 days**. You can also manually click **⟳ Import** anytime to sync the latest changes from your list.

<br>

## 🛡️ Privacy

Your username is stored locally in your browser via the userscript manager's storage API (`GM_setValue`). No data is sent anywhere except directly to the official AniList or MyAnimeList APIs. The script has no analytics, no tracking, and no external dependencies beyond the two API endpoints.

<br>

## 🔧 Requirements

- A Chromium or Firefox browser
- Tampermonkey or Violentmonkey
- A public or accessible AniList / MAL profile

<br>

## 📜 Credits & License

**Author:** [Hamza Haroon](https://github.com/hamzaharoon1314/)

**Based on:** [AniHIDE - Hide Unrelated Episodes](https://greasyfork.org/en/scripts/470233-anihide-hide-unrelated-episodes) by **Jery** - the original concept, site selectors, Jaro-Winkler matching logic, and MAL/AniList API integration all originate from Jery's work. Anime Vault extends and rebuilds that foundation with a full-library import model, per-status filtering UI, master toggle, and a reworked network layer.

AI has been used in this script coding. <br>
Licensed under the **MIT License**.

<br>

---

<p align="center">
  Made with ♥ · <a href="https://github.com/hamzaharoon1314/">github.com/hamzaharoon1314</a>
</p>
