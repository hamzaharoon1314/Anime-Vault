// ==UserScript==
// @name        Anime Vault - Smart Anime List Filter for Streaming Sites
// @namespace   https://github.com/hamzaharoon1314/Anime-Vault/blob/main/script.js
// @version     3.1.0
// @description Filter anime on by status. Choose exactly which statuses (Watching, Planning, Completed, Dropped, On Hold) to show or hide.
// @icon        https://anilist.co/img/icons/android-chrome-512x512.png
// @author      Hamza Haroon
// @author      Jery
// @license     MIT
// @match       https://yugenanime.*/*
// @match       https://yugenanime.tv/*
// @match       https://yugenanime.sx/*
// @match       https://anitaku.*/*
// @match       https://anitaku.pe/*
// @match       https://gogoanime.*/*
// @match       https://gogoanime.tv/*
// @match       https://gogoanime3.*/*
// @match       https://gogoanime3.co/*
// @match       https://animepahe.*/
// @match       https://animepahe.si/
// @match       https://animesuge.to/*
// @match       https://animesuge.*/*
// @match       https://*animesuge.cc/*
// @match       https://www.miruro.*/*
// @match       https://www.miruro.tv/*
// @match       https://miruro.to/*
// @match       https://miruro.online/*
// @match       https://animekai.to/*
// @match       https://animekai.*/*
// @match       https://anigo.to/*
// @match       https://anikai.to/*
// @match       https://animetsu.cc/*
// @match       https://kaido.to/*
// @match       https://kuudere.to/*
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_notification
// @grant       GM.xmlHttpRequest
// @connect     graphql.anilist.co
// @connect     api.myanimelist.net
// ==/UserScript==

'use strict';

/***************************************************************
 * CONSTANTS & KEYS
 ***************************************************************/
const SETTINGS_KEY   = 'anifilter_settings';
const LIBRARY_KEY    = 'anifilter_library';
const SERVICE_KEY    = 'anifilter_service';
const REFRESH_KEY    = 'anifilter_lastRefresh';
const ENABLED_KEY    = 'anifilter_enabled';
const VERSION        = '3.0.0';

// Canonical status IDs used internally (service-agnostic)
const STATUS = {
    WATCHING:   'watching',
    PLANNING:   'planning',
    COMPLETED:  'completed',
    DROPPED:    'dropped',
    ON_HOLD:    'on_hold',
};

const STATUS_LABELS = {
    [STATUS.WATCHING]:  'Watching',
    [STATUS.PLANNING]:  'Plan to Watch',
    [STATUS.COMPLETED]: 'Completed',
    [STATUS.DROPPED]:   'Dropped',
    [STATUS.ON_HOLD]:   'On Hold',
};

// Default filter config: which statuses are SHOWN (true) vs HIDDEN (false/dimmed)
const DEFAULT_FILTER = {
    [STATUS.WATCHING]:  true,   // show
    [STATUS.PLANNING]:  true,   // show
    [STATUS.COMPLETED]: false,  // hide
    [STATUS.DROPPED]:   false,  // hide
    [STATUS.ON_HOLD]:   true,   // show
};

/***************************************************************
 * ANIME SITES
 ***************************************************************/
const ANIME_SITES = [
    {
        name: 'yugenanime',
        url: ['yugenanime.tv', 'yugenanime.sx', 'yugenanime'],
        item: '.ep-grid > li',
        title: '.ep-origin-name',
        thumbnail: '.ep-thumbnail > img'
    },
    {
        name: 'gogoanime',
        url: ['gogoanime3', 'gogoanimehd', 'gogoanime', 'anitaku'],
        item: '.items > li',
        title: '.name > a',
        thumbnail: '.img > a > img'
    },
    {
        name: 'animepahe',
        url: ['animepahe.si', 'animepahe.ru', 'animepahe.com', 'animepahe'],
        item: '.episode-wrap > .episode',
        title: '.episode-title > a',
        thumbnail: '.episode-snapshot > img',
        observe: '.episode-list-wrapper',
        timeout: 100
    },
    {
        name: 'animesuge',
        url: ['animesuge.to'],
        item: '.item',
        title: '.name > a',
        thumbnail: '.poster img'
    },
    {
        name: 'animesuge',
        url: ['animesuge.cc'],
        item: '.itemlist > li',
        title: '.name a',
        thumbnail: '.poster > img'
    },
    {
        name: 'animesuge',
        url: ['animesuge.su'],
        item: '.bs',
        title: '.tt',
        thumbnail: 'img'
    },
    {
        name: 'miruro',
        url: ['miruro'],
        item: 'a[color][title][href^="/watch"]',
        title: 'h5[title^="Title: "]',
        thumbnail: 'img[alt^="Play "]',
        observe: 'section[aria-labelledby*="continueWatching"] + div',
        timeout: 1200
    },
    {
        name: 'animekai',
        url: ['animekai.to'],
        item: '.aitem',
        title: '.title',
        thumbnail: 'img',
        observe: '.tab-body',
    },
    {
        name: 'gojo',
        url: ['animetsu.cc'],
        item: '.mx-auto > [title], .swiper-slide[title]',
        title: 'a.font-medium, div.text-xs.tracking-wide',
        thumbnail: 'img',
        observe: 'main',
        timeout: 700
    },
    {
        name: 'kaido',
        url: ['kaido.to'],
        item: '.flw-item',
        title: '.film-name > a',
        thumbnail: '.film-poster > img',
    },
    {
        name: 'kuudere',
        url: ['kuudere.to'],
        item: '.anime-card-wrapper',
        title: '.title',
        thumbnail: 'img',
        timeout: 700
    }
];

/***************************************************************
 * NETWORK HELPERS
 * Always use GM.xmlHttpRequest directly — never axios or GM_fetch.
 * This bypasses page-context CORS restrictions entirely and works
 * reliably on every re-import.
 ***************************************************************/

/**
 * Wrap GM.xmlHttpRequest in a Promise.
 * @param {string} method  - 'GET' | 'POST'
 * @param {string} url
 * @param {object} headers - key/value pairs
 * @param {string|null} body - serialized body for POST
 * @param {number} retries - retries on transient failure
 */
function gmRequest(method, url, headers = {}, body = null, retries = 3) {
    return new Promise((resolve, reject) => {
        const attempt = (attemptsLeft) => {
            GM.xmlHttpRequest({
                method,
                url,
                headers: { 'Content-Type': 'application/json', ...headers },
                data: body,
                timeout: 20000,
                onload(resp) {
                    if (resp.status >= 200 && resp.status < 300) {
                        try {
                            resolve(JSON.parse(resp.responseText));
                        } catch (e) {
                            reject(new Error(`JSON parse error: ${e.message}\nPreview: ${resp.responseText.slice(0, 200)}`));
                        }
                    } else if (resp.status === 429 && attemptsLeft > 0) {
                        // Rate-limited: back off 2s then retry
                        setTimeout(() => attempt(attemptsLeft - 1), 2000);
                    } else {
                        reject(new Error(`HTTP ${resp.status} — ${url}`));
                    }
                },
                onerror(e) {
                    if (attemptsLeft > 0) setTimeout(() => attempt(attemptsLeft - 1), 1500);
                    else reject(new Error(`Network error — ${url}: ${e.error || 'unknown'}`));
                },
                ontimeout() {
                    if (attemptsLeft > 0) setTimeout(() => attempt(attemptsLeft - 1), 1500);
                    else reject(new Error(`Timeout — ${url}`));
                }
            });
        };
        attempt(retries);
    });
}

const gmGet  = (url, headers = {})        => gmRequest('GET',  url, headers, null);
const gmPost = (url, body,  headers = {}) => gmRequest('POST', url, headers, JSON.stringify(body));

/** Run async tasks one-by-one (sequential) to respect rate limits */
async function sequential(tasks) {
    const results = [];
    for (const task of tasks) results.push(await task());
    return results;
}

/***************************************************************
 * SERVICES
 * Each service maps its own status strings to canonical STATUS IDs
 * and fetches the full library sequentially to avoid rate limits.
 ***************************************************************/
const SERVICES = [
    {
        name: 'AniList',
        icon: 'https://anilist.co/img/icons/android-chrome-512x512.png',
        // Map canonical → AniList status string
        statusMap: {
            [STATUS.WATCHING]:  'CURRENT',
            [STATUS.PLANNING]:  'PLANNING',
            [STATUS.COMPLETED]: 'COMPLETED',
            [STATUS.DROPPED]:   'DROPPED',
            [STATUS.ON_HOLD]:   'PAUSED',
        },
        apiBaseUrl: 'https://graphql.anilist.co',

        async fetchStatus(username, anilistStatus, canonicalStatus) {
            let page = 1, entries = [], hasNextPage = true;
            while (hasNextPage) {
                const query = `
                    query {
                        Page(page:${page}, perPage:50) {
                            pageInfo { hasNextPage currentPage }
                            mediaList(userName:"${username}", type:ANIME, status:${anilistStatus}) {
                                media { title { romaji english native userPreferred } }
                            }
                        }
                    }
                `;
                const data = await gmPost(this.apiBaseUrl, { query });
                if (data.errors) throw new Error(`AniList error: ${data.errors[0].message}`);
                const page_data = data.data.Page;
                entries = entries.concat(page_data.mediaList);
                hasNextPage = page_data.pageInfo.hasNextPage;
                page = page_data.pageInfo.currentPage + 1;
            }
            return entries.map(entry => {
                const titles = Object.values(entry.media.title).filter(Boolean);
                return new AnimeEntry(titles, canonicalStatus);
            });
        },

        async getFullLibrary(username) {
            const tasks = Object.entries(this.statusMap).map(
                ([canonical, alStatus]) => () => this.fetchStatus(username, alStatus, canonical)
            );
            const results = await sequential(tasks);
            return results.flat();
        }
    },
    {
        name: 'MyAnimeList',
        icon: 'https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ',
        _clientId: '0fa773846da212822f7bed55971f9645',
        statusMap: {
            [STATUS.WATCHING]:  'watching',
            [STATUS.PLANNING]:  'plan_to_watch',
            [STATUS.COMPLETED]: 'completed',
            [STATUS.DROPPED]:   'dropped',
            [STATUS.ON_HOLD]:   'on_hold',
        },
        apiBaseUrl: 'https://api.myanimelist.net/v2/users',

        async fetchStatus(username, malStatus, canonicalStatus) {
            const url = `${this.apiBaseUrl}/${username}/animelist?fields=alternative_titles&status=${malStatus}&limit=1000`;
            const data = await gmGet(url, { 'X-MAL-CLIENT-ID': this._clientId });
            return (data.data || []).map(entry => {
                const altTitles = entry.node.alternative_titles || {};
                const titles = [
                    entry.node.title,
                    ...Object.values(altTitles).flat()
                ].filter(Boolean);
                return new AnimeEntry(titles, canonicalStatus);
            });
        },

        async getFullLibrary(username) {
            const tasks = Object.entries(this.statusMap).map(
                ([canonical, malStatus]) => () => this.fetchStatus(username, malStatus, canonical)
            );
            const results = await sequential(tasks);
            return results.flat();
        }
    }
];

/***************************************************************
 * DATA CLASSES
 ***************************************************************/
class AnimeEntry {
    constructor(titles, status) {
        this.titles = titles;   // array of title strings (inc. alt titles)
        this.status = status;   // canonical STATUS key
    }
}

class AnimeLibrary {
    constructor() {
        // entries: AnimeEntry[]
        this.entries = GM_getValue(LIBRARY_KEY, []);
    }

    save() {
        GM_setValue(LIBRARY_KEY, this.entries);
    }

    clear() {
        this.entries = [];
    }

    addEntries(entries) {
        this.entries = this.entries.concat(entries);
    }

    // Get the canonical status of a title (fuzzy match), or null
    getStatus(title) {
        const match = this._fuzzyFind(title);
        return match ? match.status : null;
    }

    _fuzzyFind(title) {
        const threshold = 0.8;
        const a = title.toLowerCase();
        return this.entries.find(e =>
            e.titles.some(t => jaroWinkler(a, t.toLowerCase()) >= threshold)
        );
    }
}

class Settings {
    constructor() {
        const saved = GM_getValue(SETTINGS_KEY, {});
        this.filter  = Object.assign({}, DEFAULT_FILTER, saved.filter || {});
        this.usernames = saved.usernames || {};
        this.dimOpacity = saved.dimOpacity !== undefined ? saved.dimOpacity : 0.12;
    }

    save() {
        GM_setValue(SETTINGS_KEY, {
            filter: this.filter,
            usernames: this.usernames,
            dimOpacity: this.dimOpacity,
        });
    }
}

/***************************************************************
 * JARO-WINKLER SIMILARITY
 ***************************************************************/
function jaroWinkler(a, b) {
    const m = a.length, n = b.length;
    if (m === 0 && n === 0) return 1;
    if (m === 0 || n === 0) return 0;
    const max = Math.floor(Math.max(m, n) / 2) - 1;
    const ma = Array(m).fill(false), mb = Array(n).fill(false);
    let mtc = 0;
    for (let i = 0; i < m; i++) {
        const s = Math.max(0, i - max), e = Math.min(n, i + max + 1);
        for (let j = s; j < e; j++) {
            if (!mb[j] && a[i] === b[j]) { ma[i] = true; mb[j] = true; mtc++; break; }
        }
    }
    if (mtc === 0) return 0;
    let tr = 0, k = 0;
    for (let i = 0; i < m; i++) {
        if (ma[i]) { while (!mb[k]) k++; if (a[i] !== b[k]) tr++; k++; }
    }
    return (mtc / m + mtc / n + (mtc - tr / 2) / mtc) / 3;
}

/***************************************************************
 * WEBSITE CLASS
 ***************************************************************/
class Website {
    constructor(site) {
        this.site = site;
        GM_addStyle(`
            ${site.item} ${site.thumbnail}:hover {
                opacity: 1 !important;
                filter: brightness(1) !important;
                transition: .15s ease-in-out !important;
            }
        `);
    }

    getAnimeItems() {
        return document.querySelectorAll(this.site.item);
    }

    getAnimeTitle(animeItem) {
        const titleEl = animeItem.querySelector(this.site.title);
        return titleEl
            ? Array.from(titleEl.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent.trim())
                .join('').trim()
            : '';
    }

    // Restore all items to full visibility (used when filter is disabled)
    clearFilter() {
        this.getAnimeItems().forEach(item => {
            const thumbnail = item.querySelector(this.site.thumbnail);
            if (thumbnail) thumbnail.style.cssText = 'opacity:1; filter:brightness(1); transition:.3s ease-in-out';
            item.removeAttribute('data-anifilter-status');
        });
    }

    applyFilter(library, settings) {
        if (!enabled) return this.clearFilter();
        this.getAnimeItems().forEach(item => {
            const thumbnail = item.querySelector(this.site.thumbnail);
            if (!thumbnail) return;

            const title = this.getAnimeTitle(item);
            if (!title) return;

            // Look up status from library
            const effectiveStatus = library.getStatus(title);

            let shouldShow;
            if (effectiveStatus === null) {
                // Not in list at all — show by default
                shouldShow = true;
            } else {
                shouldShow = settings.filter[effectiveStatus] !== false;
            }

            const op = settings.dimOpacity;
            thumbnail.style.cssText = shouldShow
                ? 'opacity:1; filter:brightness(1); transition:.2s ease-in-out'
                : `opacity:${op}; filter:brightness(${op * 1.5}) grayscale(0.9); transition:.4s ease-in-out`;

            // Add a data attribute so the UI tooltip can show status
            item.setAttribute('data-anifilter-status', effectiveStatus || 'unknown');
        });
    }
}

/***************************************************************
 * GLOBAL STATE
 ***************************************************************/
let settings  = new Settings();
let library   = new AnimeLibrary();
let service   = SERVICES[parseInt(GM_getValue(SERVICE_KEY, 0))]; // default: AniList (index 0)
let enabled   = GM_getValue(ENABLED_KEY, true); // master on/off switch

/***************************************************************
 * SETTINGS PANEL UI
 ***************************************************************/
function buildSettingsPanel() {
    // Remove existing panel
    document.getElementById('anifilter-panel')?.remove();

    const STATUS_COLORS = {
        [STATUS.WATCHING]:  '#4fc3f7',
        [STATUS.PLANNING]:  '#a5d6a7',
        [STATUS.COMPLETED]: '#ce93d8',
        [STATUS.DROPPED]:   '#ef9a9a',
        [STATUS.ON_HOLD]:   '#ffcc80',
    };

    // Count library entries per status
    const counts = {};
    Object.values(STATUS).forEach(s => counts[s] = 0);
    library.entries.forEach(e => {
        if (counts[e.status] !== undefined) counts[e.status]++;
    });

    const panel = document.createElement('div');
    panel.id = 'anifilter-panel';
    panel.innerHTML = `
        <div id="af-header">
            <span id="af-logo">⬡</span>
            <span id="af-title">AniFilter</span>
            <button id="af-power" class="${enabled ? 'on' : 'off'}" title="${enabled ? 'Disable filter' : 'Enable filter'}">
                ${enabled ? '⏻' : '⏻'}
            </button>
            <button id="af-close">✕</button>
        </div>

        <div id="af-section">
            <div class="af-section-label">SERVICE</div>
            <div id="af-services">
                ${SERVICES.map((s, i) => `
                    <button class="af-service-btn ${service.name === s.name ? 'active' : ''}" data-idx="${i}">
                        <img src="${s.icon}" width="14" height="14" style="border-radius:50%">
                        ${s.name}
                    </button>
                `).join('')}
            </div>
        </div>

        <div id="af-section">
            <div class="af-section-label">USERNAME</div>
            <div id="af-username-row">
                <input id="af-username-input" type="text" placeholder="Your ${service.name} username"
                    value="${settings.usernames[service.name] || ''}" spellcheck="false" />
                <button id="af-refresh-btn" title="Import full library">⟳ Import</button>
            </div>
            <div id="af-lib-status"></div>
        </div>

        <div id="af-section">
            <div class="af-section-label">SHOW / HIDE BY STATUS</div>
            <div id="af-toggles">
                ${Object.values(STATUS).map(s => `
                    <label class="af-toggle-row" data-status="${s}">
                        <span class="af-status-dot" style="background:${STATUS_COLORS[s]}"></span>
                        <span class="af-status-name">${STATUS_LABELS[s]}</span>
                        <span class="af-status-count">${counts[s]}</span>
                        <div class="af-switch ${settings.filter[s] !== false ? 'on' : ''}">
                            <div class="af-switch-knob"></div>
                        </div>
                    </label>
                `).join('')}
            </div>
        </div>

        <div id="af-section">
            <div class="af-section-label">DIM OPACITY <span id="af-opacity-val">${Math.round(settings.dimOpacity * 100)}%</span></div>
            <input id="af-opacity-slider" type="range" min="0" max="40" value="${Math.round(settings.dimOpacity * 100)}" />
        </div>

        <div id="af-footer">
            Last import: <span id="af-last-refresh">${formatLastRefresh()}</span>
        </div>
    `;

    document.body.appendChild(panel);
    injectPanelStyles();
    bindPanelEvents(panel);
    updateLibStatus();
}

function injectPanelStyles() {
    const existing = document.getElementById('anifilter-styles');
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = 'anifilter-styles';
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap');

        #anifilter-fab {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 48px;
            height: 48px;
            border-radius: 14px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 1.5px solid rgba(79, 195, 247, 0.4);
            color: #4fc3f7;
            font-size: 22px;
            cursor: pointer;
            z-index: 999998;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 24px rgba(79,195,247,0.18), 0 2px 8px rgba(0,0,0,0.5);
            transition: all .2s ease;
        }
        #anifilter-fab:hover {
            transform: scale(1.08) rotate(12deg);
            border-color: #4fc3f7;
            box-shadow: 0 4px 32px rgba(79,195,247,0.35);
        }
        #anifilter-fab.disabled {
            border-color: rgba(239,154,154,0.4);
            color: #ef9a9a;
            box-shadow: 0 4px 24px rgba(239,154,154,0.12), 0 2px 8px rgba(0,0,0,0.5);
        }
        #anifilter-fab.disabled:hover {
            border-color: #ef9a9a;
            box-shadow: 0 4px 32px rgba(239,154,154,0.3);
        }

        #anifilter-panel {
            position: fixed;
            bottom: 84px;
            right: 24px;
            width: 320px;
            max-height: 88vh;
            overflow-y: auto;
            background: #0d1117;
            border: 1.5px solid rgba(79, 195, 247, 0.18);
            border-radius: 18px;
            z-index: 999999;
            font-family: 'Syne', sans-serif;
            color: #e0e0e0;
            box-shadow: 0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset;
            scrollbar-width: thin;
            scrollbar-color: #1e2d3d transparent;
        }
        #anifilter-panel::-webkit-scrollbar { width: 4px; }
        #anifilter-panel::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 4px; }

        #af-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 16px 18px 14px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            position: sticky;
            top: 0;
            background: #0d1117;
            z-index: 1;
        }
        #af-logo {
            font-size: 20px;
            color: #4fc3f7;
            line-height: 1;
        }
        #af-title {
            font-weight: 800;
            font-size: 15px;
            letter-spacing: 0.08em;
            color: #fff;
            flex: 1;
        }
        #af-close {
            background: none;
            border: none;
            color: #555;
            font-size: 14px;
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 4px;
            transition: color .15s;
        }
        #af-close:hover { color: #ef9a9a; }

        #af-power {
            background: none;
            border: 1.5px solid rgba(255,255,255,0.12);
            border-radius: 8px;
            font-size: 15px;
            cursor: pointer;
            padding: 2px 7px;
            transition: all .15s;
            line-height: 1;
        }
        #af-power.on  { color: #4fc3f7; border-color: rgba(79,195,247,0.4); }
        #af-power.off { color: #ef9a9a; border-color: rgba(239,154,154,0.4); }

        #af-section {
            padding: 14px 18px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .af-section-label {
            font-family: 'Space Mono', monospace;
            font-size: 9px;
            letter-spacing: 0.18em;
            color: #4fc3f7;
            margin-bottom: 10px;
            font-weight: 700;
        }

        #af-services {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }
        .af-service-btn {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 5px 10px;
            border-radius: 8px;
            border: 1.5px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.04);
            color: #aaa;
            font-family: 'Syne', sans-serif;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all .15s;
        }
        .af-service-btn:hover { border-color: #4fc3f7; color: #fff; }
        .af-service-btn.active { border-color: #4fc3f7; background: rgba(79,195,247,0.12); color: #4fc3f7; }

        #af-username-row {
            display: flex;
            gap: 6px;
        }
        #af-username-input {
            flex: 1;
            background: rgba(255,255,255,0.05);
            border: 1.5px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            color: #fff;
            font-family: 'Space Mono', monospace;
            font-size: 11px;
            padding: 7px 10px;
            outline: none;
            transition: border-color .15s;
        }
        #af-username-input:focus { border-color: #4fc3f7; }
        #af-refresh-btn {
            padding: 7px 11px;
            border-radius: 8px;
            border: none;
            background: linear-gradient(135deg, #1565c0, #1e88e5);
            color: #fff;
            font-family: 'Syne', sans-serif;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            white-space: nowrap;
            transition: opacity .15s, transform .1s;
        }
        #af-refresh-btn:hover { opacity: 0.9; transform: scale(1.03); }
        #af-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        #af-lib-status {
            font-family: 'Space Mono', monospace;
            font-size: 10px;
            color: #4fc3f7;
            margin-top: 7px;
            min-height: 14px;
        }

        #af-toggles {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .af-toggle-row {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            padding: 6px 8px;
            border-radius: 8px;
            transition: background .12s;
        }
        .af-toggle-row:hover { background: rgba(255,255,255,0.04); }
        .af-status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .af-status-name {
            flex: 1;
            font-size: 12px;
            font-weight: 600;
        }
        .af-status-count {
            font-family: 'Space Mono', monospace;
            font-size: 10px;
            color: #555;
            min-width: 24px;
            text-align: right;
        }
        .af-switch {
            width: 34px;
            height: 18px;
            border-radius: 9px;
            background: rgba(255,255,255,0.1);
            border: 1.5px solid rgba(255,255,255,0.15);
            position: relative;
            transition: background .2s, border-color .2s;
            flex-shrink: 0;
        }
        .af-switch.on { background: rgba(79,195,247,0.25); border-color: #4fc3f7; }
        .af-switch-knob {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #555;
            transition: transform .2s, background .2s;
        }
        .af-switch.on .af-switch-knob { transform: translateX(16px); background: #4fc3f7; }

        #af-opacity-slider {
            width: 100%;
            accent-color: #4fc3f7;
            cursor: pointer;
        }
        #af-opacity-val {
            font-family: 'Space Mono', monospace;
            font-size: 10px;
            color: #aaa;
            float: right;
        }

        #af-footer {
            padding: 10px 18px;
            font-family: 'Space Mono', monospace;
            font-size: 9px;
            color: #333;
        }

        /* Inline status badge on hover */
        [data-anifilter-status]:hover::before {
            content: attr(data-anifilter-status);
            position: absolute;
            top: 4px;
            left: 4px;
            background: rgba(0,0,0,0.8);
            color: #4fc3f7;
            font-size: 9px;
            font-family: 'Space Mono', monospace;
            padding: 2px 5px;
            border-radius: 4px;
            z-index: 10;
            pointer-events: none;
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }
        [data-anifilter-status] { position: relative; }
    `;
    document.head.appendChild(style);
}

function bindPanelEvents(panel) {
    // Close button
    panel.querySelector('#af-close').addEventListener('click', () => panel.remove());

    // Power toggle
    panel.querySelector('#af-power').addEventListener('click', () => {
        enabled = !enabled;
        GM_setValue(ENABLED_KEY, enabled);
        // Update button appearance
        const btn = panel.querySelector('#af-power');
        btn.className = enabled ? 'on' : 'off';
        btn.title = enabled ? 'Disable filter' : 'Enable filter';
        // Update FAB appearance
        syncFAB();
        // Apply or clear filter immediately
        executeAnimeFiltering();
    });

    // Service switcher
    panel.querySelectorAll('.af-service-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            service = SERVICES[idx];
            GM_setValue(SERVICE_KEY, idx);
            panel.querySelector('#af-username-input').placeholder = `Your ${service.name} username`;
            panel.querySelector('#af-username-input').value = settings.usernames[service.name] || '';
            panel.querySelectorAll('.af-service-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateLibStatus();
        });
    });

    // Refresh / Import button
    panel.querySelector('#af-refresh-btn').addEventListener('click', async () => {
        const username = panel.querySelector('#af-username-input').value.trim();
        if (!username) { setLibStatus('⚠ Enter a username first', '#ef9a9a'); return; }
        settings.usernames[service.name] = username;
        settings.save();
        await importFullLibrary();
        buildSettingsPanel(); // rebuild to update counts
    });

    // Toggle rows
    panel.querySelectorAll('.af-toggle-row').forEach(row => {
        row.addEventListener('click', () => {
            const status = row.dataset.status;
            settings.filter[status] = !settings.filter[status];
            settings.save();
            const sw = row.querySelector('.af-switch');
            sw.classList.toggle('on', settings.filter[status]);
            executeAnimeFiltering();
        });
    });

    // Opacity slider
    const slider = panel.querySelector('#af-opacity-slider');
    slider.addEventListener('input', () => {
        const val = parseInt(slider.value) / 100;
        settings.dimOpacity = val;
        settings.save();
        panel.querySelector('#af-opacity-val').textContent = `${slider.value}%`;
        executeAnimeFiltering();
    });
}

function setLibStatus(msg, color = '#4fc3f7') {
    const el = document.getElementById('af-lib-status');
    if (el) { el.textContent = msg; el.style.color = color; }
}

function updateLibStatus() {
    const total = library.entries.length;
    if (total === 0) {
        setLibStatus('No library imported yet.', '#555');
    } else {
        const counts = {};
        library.entries.forEach(e => { counts[e.status] = (counts[e.status] || 0) + 1; });
        const summary = Object.entries(counts)
            .map(([s, c]) => `${c} ${STATUS_LABELS[s] || s}`)
            .join(' · ');
        setLibStatus(`✓ ${total} total · ${summary}`);
    }
}

function formatLastRefresh() {
    const t = GM_getValue(REFRESH_KEY, 0);
    if (!t) return 'Never';
    const diff = Date.now() - t;
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

/***************************************************************
 * FLOATING ACTION BUTTON
 ***************************************************************/
// Sync FAB appearance to current enabled state
function syncFAB() {
    const fab = document.getElementById('anifilter-fab');
    if (!fab) return;
    fab.classList.toggle('disabled', !enabled);
    fab.title = enabled ? 'AniFilter Settings' : 'AniFilter (disabled) — click to open';
}

function buildFAB() {
    if (document.getElementById('anifilter-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'anifilter-fab';
    fab.title = 'AniFilter Settings';
    fab.textContent = '⬡';
    fab.addEventListener('click', () => {
        if (document.getElementById('anifilter-panel')) {
            document.getElementById('anifilter-panel').remove();
        } else {
            buildSettingsPanel();
        }
    });
    document.body.appendChild(fab);
    injectPanelStyles();
    syncFAB();
}

/***************************************************************
 * IMPORT FULL LIBRARY
 ***************************************************************/
async function importFullLibrary() {
    const username = settings.usernames[service.name];
    if (!username) {
        setLibStatus('⚠ Set username first.', '#ef9a9a');
        return;
    }

    setLibStatus('⟳ Importing full library...', '#ffcc80');
    GM_notification(`Importing full ${service.name} library…`, 'AniFilter', service.icon);

    try {
        const entries = await service.getFullLibrary(username);
        library.clear();
        library.addEntries(entries);
        library.save();
        GM_setValue(REFRESH_KEY, Date.now());

        const total = entries.length;
        const counts = {};
        entries.forEach(e => { counts[e.status] = (counts[e.status] || 0) + 1; });
        const summary = Object.entries(counts)
            .map(([s, c]) => `${c} ${STATUS_LABELS[s] || s}`)
            .join(', ');

        setLibStatus(`✓ ${total} anime imported`, '#a5d6a7');
        GM_notification(`Imported ${total} anime: ${summary}`, 'AniFilter', service.icon);
        console.log('[AniFilter] Library:', library.entries);
        executeAnimeFiltering();
    } catch (err) {
        console.error('[AniFilter] Import error:', err);
        setLibStatus(`✗ Import failed: ${err.message}`, '#ef9a9a');
        GM_notification(`Import failed: ${err.message}`, 'AniFilter', service.icon);
    }
}

/***************************************************************
 * FILTERING ENGINE
 ***************************************************************/
function executeAnimeFiltering() {
    const animeSite = getCurrentSite();
    if (!animeSite) return;

    const thisSite = new Website(animeSite);

    setTimeout(() => {
        if (animeSite.observe) {
            const observeTarget = document.querySelector(animeSite.observe);
            if (observeTarget) {
                let debounce;
                new MutationObserver(() => {
                    clearTimeout(debounce);
                    debounce = setTimeout(() => thisSite.applyFilter(library, settings), 100);
                }).observe(observeTarget, { childList: true, subtree: true, attributeFilter: ['src'] });
            }
        }
        thisSite.applyFilter(library, settings);
    }, animeSite.timeout || 0);
}

function getCurrentSite() {
    const url = window.location.href.toLowerCase();
    return ANIME_SITES.find(site => site.url.some(u => url.includes(u)));
}

/***************************************************************
 * MENU COMMAND (fallback for no FAB)
 ***************************************************************/
GM_registerMenuCommand('⬡ AniFilter Settings', () => buildSettingsPanel());
GM_registerMenuCommand('⟳ AniFilter: Import Library', () => importFullLibrary());

/***************************************************************
 * INIT
 ***************************************************************/
function init() {
    // Handle SPA navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            executeAnimeFiltering();
        }
    }).observe(document.body, { subtree: true, childList: true });
    window.addEventListener('popstate',     executeAnimeFiltering);
    window.addEventListener('pushstate',    executeAnimeFiltering);
    window.addEventListener('replacestate', executeAnimeFiltering);

    buildFAB();
    executeAnimeFiltering();

    // Auto-refresh library every 1 day
    const last = GM_getValue(REFRESH_KEY, 0);
    if (Date.now() - last > 1 * 24 * 60 * 60 * 1000) {
        console.log('[AniFilter] Auto-refreshing library (>1 days old)…');
        importFullLibrary();
    }
}

init();
