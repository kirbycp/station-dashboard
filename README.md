# Ham Station Dashboard

A single-file, self-contained HTML start page for a ham radio station: live propagation, a band-conditions heatmap, local weather, an upcoming-contests ticker, quick links, and one-click launchers for your station software. No build step, no server, no dependencies to install — open `station-dashboard.html` and it runs.

## Customizations

Everything below is a plain-text or small-HTML edit inside `station-dashboard.html` — no tooling required.

### Callsign and title

In the header markup:

```html
<span class="call">K5CTW</span>
```

Replace `K5CTW` with your own callsign.

### Default (fallback) location

The weather panel and the band-conditions heatmap's day/night model both need a station location. They first try the browser's own geolocation; if that's denied, unavailable, or times out, they fall back to a fixed coordinate defined near the top of the weather section of the script:

```js
const FALLBACK_LAT = 33.23623, FALLBACK_LON = -96.80111; // Prosper, TX 75078 — edit to your station's coordinates
```

Edit these two numbers to your own station's latitude/longitude. This only matters as a fallback — if you allow location access in the browser, your actual location is used instead and this constant is never shown.

### Local clock

The "Local" time in the header reads the time zone straight from your Mac/iPad's own system setting (`Intl.DateTimeFormat().resolvedOptions().timeZone`) — there's nothing to configure here. Change your device's time zone and it follows automatically.

## Adding or removing Station Software / Quick Links tiles

Both panels use the same tile pattern — a title, a one-line subtitle, and a single button. The button's label tells you which kind it is:

- **`Launch`** — calls an Apple Shortcut by exact name via `shortcuts://run-shortcut?name=...`. Use this for desktop apps you've wired up with a Shortcut (see below).
- **`Open`** — a plain link to a website, opened in a new tab. Use this for anything without a Shortcut, or for iPad, where a `shortcuts://` call can't reach a Mac-only app anyway.

Each tile is one `<div class="tile-card">` inside a `<div class="tile-grid">`. The grid auto-sizes its columns (`repeat(auto-fit, minmax(150px, 1fr))`), so adding or removing tiles reflows automatically — you don't need to touch any CSS or column counts.

**To add a Launch tile** (Station Software panel), copy this block inside that panel's `<div class="tile-grid">` and edit the three highlighted parts:

```html
<div class="tile-card">
  <div>
    <span class="tile-title">App Name</span>
    <span class="tile-sub">Short description</span>
  </div>
  <div class="tile-actions">
    <a class="btn primary" href="shortcuts://run-shortcut?name=Your%20Shortcut%20Name">Launch</a>
  </div>
</div>
```

The `name=` value must match your Shortcut's name **exactly**, case-sensitive, URL-encoded (spaces as `%20`). On the Mac, `shortcuts list` will show you the exact names of everything you have, and `shortcuts run "Your Shortcut Name"` lets you test one directly without touching the dashboard, to confirm it launches the right app before wiring up the button.

**To add an Open tile** (works in either panel), same shape, just point the single button at a URL instead:

```html
<div class="tile-card">
  <div>
    <span class="tile-title">Site Name</span>
    <span class="tile-sub">short.domain.com</span>
  </div>
  <div class="tile-actions">
    <a class="btn primary" href="https://example.com/" target="_blank" rel="noopener">Open</a>
  </div>
</div>
```

**To remove a tile**, delete its whole `<div class="tile-card">...</div>` block. Nothing else references it, so this is always safe.

## How live data populates the panels

All of this happens client-side, in the browser, with no backend of your own — the page calls a handful of free public APIs directly. Every one of the three panels below follows the same pattern: try a live fetch, and if that fails (or the browser is offline), fall back to the last successful result, which was saved to `localStorage` the last time a fetch succeeded. A small **LIVE** / **CACHED · Xm ago** badge next to each panel title always shows which one you're looking at.

### Propagation (gauges, band heatmap, 3-day outlook)

On page load, `loadPropagation()` fetches six things in parallel from NOAA's Space Weather Prediction Center, all free and requiring no API key:

- `10cm-flux.json` — Solar Flux Index (SFI)
- `noaa-planetary-k-index.json` — Planetary K-index
- `xrays-6-hour.json` (GOES) — X-ray flux, used to derive the flare class (A–X)
- `solar-wind-speed.json` — solar wind speed
- `wwv.txt` — NOAA's geophysical alert bulletin, parsed for the A-index and a plain-English 24-hour outlook
- `3-day-forecast.txt` — parsed for the 3-day max-Kp geomagnetic outlook

From these, the page also *estimates* the sunspot number (no free live feed for that exists) using the standard ITU-R F10.7↔SSN relation.

The **band-conditions heatmap** is a real point-to-point circuit prediction: pick a DX target from the dropdown above the grid, and the page calls the [VOACAP service](../LateNight%20Labs/WebServices/VOCAP) (`VOACAP_SERVICE_URL` near the top of the script) with your station's coordinates, the target's coordinates, live SFI, and K-index, and renders the returned hour-by-band reliability directly. That service is itself a labeled `heuristic-v0` model — real great-circle/solar geometry, but not yet a certified ITU-R P.533/VOACAP implementation (see its own README for the roadmap). If the service is unreachable, the page falls back to the last successfully cached prediction for that target; if nothing is cached either, it falls back further to a simplified local single-station heuristic (`computeHeuristicLevels()`) so the panel never goes blank. Setting `VOACAP_SERVICE_URL = null` skips the service entirely and always uses that local heuristic.

### Local Weather

`loadWeather()` calls the free [Open-Meteo](https://open-meteo.com/) API with your station's coordinates (device geolocation, or the fallback above) for current conditions and a 3-day forecast — temperature, conditions, humidity, and wind speed/gusts (called out specifically since wind matters for antenna work). No API key required.

### Upcoming Contests

`loadContests()` pulls the [WA7BNM Contest Calendar](https://www.contestcalendar.com/)'s 8-day RSS feed. That feed has no CORS headers (it's built for RSS readers, not browser JavaScript), so it's fetched through [rss2json.com](https://rss2json.com/), a free service built specifically for reading RSS client-side. Each entry's date/time range is parsed into real `Date` objects so the ticker can tag contests **SOON** (within 48 hours) or **LIVE** (currently running), and only scrolls if the day's contests don't already fit on one line.
