# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`station-dashboard.html` is a single self-contained static HTML file: a personal ham radio "station dashboard" / browser start page. There is no build system, no package manager, no test suite, and no server-side code — everything (markup, CSS, JS) lives in this one file and runs entirely client-side. The only other files are the PWA install/offline support: `manifest.json`, `sw.js`, and `icons/` (see "Offline install (PWA)" below).

## Commands

There is no build/lint/test tooling. The only thing to know is how to run it correctly:

- **Do not just double-click the file or open it via a `file://` URL for real testing.** Several features silently break under a `file://` origin: `localStorage` (used for the offline-cache fallback) throws in some browser contexts, and the CORS proxies/APIs behave inconsistently. Always serve it over a real HTTP origin when verifying changes:
  ```
  python3 -m http.server 8000
  ```
  then open `http://localhost:8000/station-dashboard.html`.
- To verify the "Station Software" Launch buttons (Apple Shortcuts integration) from the Mac itself:
  ```
  shortcuts list            # see exact shortcut names — must match the button's ?name= param, case-sensitive
  shortcuts run "<Name>"    # run one directly to confirm it actually launches the right app
  ```

## Architecture

Everything is in `station-dashboard.html`: a `<style>` block, the markup, then one `<script>` block at the bottom. Key things that aren't obvious from reading any single section in isolation:

**Live data + offline resilience pattern.** Every live-data panel (propagation gauges/band heatmap, local weather, contest ticker) follows the same shape: fetch live → on success, render and `saveCache(section, data)` to `localStorage` under `hamdash_cache_v1` → on failure, or if `navigator.onLine === false`, fall back to `loadCache(section)` and replay the last known-good snapshot through the *same* render function used for live data. `setSourceBadge()` drives the small LIVE/CACHED badge next to each panel title. When adding a new live-data panel, follow this same fetch → cache → fallback shape rather than a one-off try/catch.

**Station coordinates are fetched once and shared.** `getCoords()` (browser geolocation, falling back to `FALLBACK_LAT`/`FALLBACK_LON` after a timeout) is called a single time in the `boot()` IIFE at the bottom of the script, then passed into both `loadWeather()` and `loadPropagation()` — the band-conditions heatmap needs it for real sun-elevation day/night math, not just a day/night boolean.

**Band conditions heatmap: local fallback is an explicit heuristic; the live path is now real VOACAP.** `sunElevationDeg()` computes actual solar elevation for the station's location/hour; `bandLevel()` combines that with live SFI/K-index/X-ray class into a continuous 0–1 score per band/hour; `heatColor()` maps that to the red→amber→teal gradient — this local heuristic is the fallback path (used when `VOACAP_SERVICE_URL` is unset, offline with nothing cached, or the service call fails). The primary path, `VOACAP_SERVICE_URL`, points at `voacapl-service` (LateNight Labs), which wraps the actual compiled VOACAP engine (jawatson/voacapl) — not a heuristic. Two things worth remembering when touching this:
- `voacapl-service` is a **monthly-median** model (smoothed sunspot number + month), so unlike the local heuristic it does **not** use K-index — `kidx` is still sent in the request body (for shape parity with `vocap-service`'s older heuristic-v0 API) but is silently ignored server-side. Don't read the "K-index" mention out of `bandNote`'s cached/offline-branch copy as implying the live circuit prediction is storm-aware; it isn't.
- `vocap-service` (the original heuristic-v0 sibling, `"model":"heuristic-v0"` in every response) is still deployed and still useful for comparison, but is no longer what `VOACAP_SERVICE_URL` points at. See `voacapl-service`'s and `vocap-service`'s READMEs for the full story and the field-level assumptions (generic reference antenna, SFI-derived SSN, etc.) baked into the real-VOACAP predictions.

**CORS constraints shaped which data sources are used — don't re-litigate these without re-checking:**
- NOAA SWPC JSON/text endpoints and Open-Meteo are directly fetchable client-side (no proxy needed).
- DX cluster / PSK Reporter spot data has no CORS support anywhere and cannot be fetched client-side without standing up a real backend proxy — this is why there's no live band-activity/spot panel, only outbound links.
- The WA7BNM contest RSS feed also has no CORS headers, so it's fetched through `rss2json.com` (a purpose-built RSS→JSON service), not a generic CORS proxy — generic proxies (allorigins.win, corsproxy.io, api.codetabs.com) were tried during development and found unreliable, rate-limited, or since paywalled. The WA7BNM attribution text and link in that panel are required by their terms of use — don't remove them.

**Apple Shortcuts integration.** "Launch" buttons use the `shortcuts://run-shortcut?name=<exact name>` URL scheme to call a user-created Shortcut by name (case-sensitive, exact match required — verify with `shortcuts list`). Tiles without a working Shortcut instead use a single "Open" button pointing at the app/service's website. Each software/quick-link tile is meant to have exactly one action button whose label (`Launch` vs `Open`) reflects which kind it is — not both.

**Design system.** CSS custom properties in `:root` define the whole dark, hardware-dashboard-style palette (`--amber`, `--teal`, `--red` carry semantic meaning: good/neutral/bad across gauges, band cells, and status banners — reuse them rather than introducing new colors). Fonts (Space Grotesk, IBM Plex Mono) load from Google Fonts. Layout is plain flexbox/CSS grid with two manual breakpoints (720px, 480px); the tile grids (`Station Software`, `Quick Links`) use `repeat(auto-fit, minmax(...))` specifically so they self-balance regardless of item count, rather than fixed column counts.

**Local clock is fully offline.** The local-time display reads `Intl.DateTimeFormat().resolvedOptions().timeZone` directly from the device — no network call, works without permission prompts, and is intentionally *not* IP-geolocation-based (that was tried and replaced; it's unreliable behind VPNs and required a network round-trip for something the OS already knows).

**Offline install (PWA).** iPad Safari can't open local HTML files, so the dashboard is meant to be hosted over HTTPS once and added to the Home Screen. `sw.js` caches the app shell (the HTML, manifest, icons) and the Google Fonts CSS/woff2 files; it does *not* touch the live-data API calls, which keep using the page's own `localStorage` fetch → cache → fallback path. The HTML is served network-first (4s timeout, then cache) so edits show up as soon as the device is online. Things to remember:
- Service workers only register over http(s), so `file://` is skipped silently. `localhost` counts as secure, so `python3 -m http.server` still works for testing.
- If you add/rename a file in the `SHELL` list in `sw.js`, bump `CACHE_VERSION`. Edits to `station-dashboard.html` alone don't need a bump.
- All paths (`start_url`, icons, SW registration) are relative, so it works from a subpath like `user.github.io/station-dashboard/`.
- The Browser pane in the Claude desktop app can't register service workers at all (fails even for a nonexistent script). Test in real Chrome/Safari instead.
