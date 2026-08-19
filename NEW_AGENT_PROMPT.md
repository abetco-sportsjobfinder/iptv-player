# IPTV PLAYER - COMPREHENSIVE DIAGNOSTIC PROMPT FOR NEW AGENT

## MISSION
Fix the IPTV Player at D:\iptv-player so it:
1. Loads all channels (currently 0 showing)
2. Plays working streams reliably
3. Handles dead streams gracefully
4. Deploys to Cloudflare Pages successfully

---

## CURRENT STATE (AS OF 2026-08-18)

### Working Assets
- **Proxy**: https://iptv-stream-proxy.abetscrape.workers.dev ✅ (200 OK, CORS, segment rewriting)
- **Data Source**: iptv-org API (41,076 channels, 16,588 streams, 1,578 blocklist)
- **Free-TV/IPTV M3U**: 2,065 channels from Pluto/Samsung/etc.
- **Last Working Deploy**: https://9fc7dd2d.iptv-player-20g.pages.dev (vanilla JS, before hls.js edit)

### Broken
- **D:\iptv-player\app.js** - Currently 36 lines (corrupted), should be ~436 lines
- **Channels showing**: 0 (filteredCount = 0) despite 41,076 loading
- **NFL/MLB streams**: Dead at source (Akamai quality levels 404)
- **ABC News**: Dead at source (quality levels 404)

### Deployed URLs
- **Working vanilla**: https://9fc7dd2d.iptv-player-20g.pages.dev
- **Current broken**: https://ce4026e7.iptv-player-20g.pages.dev
- **Proxy**: https://iptv-stream-proxy.abetscrape.workers.dev

---

## ROOT CAUSES TO INVESTIGATE

### 1. ZERO CHANNELS SHOWING (CRITICAL)
**Location**: `D:\iptv-player\app.js` - `applyFilters()` and `renderVirtualList()`
- Data loads: 41,076 channels, 16,588 streams
- But `filteredCount = 0` in console
- Check: `applyFilters()` logic, `filteredChannels` assignment, `renderVirtualList()` early return

### 2. APP.JS CORRUPTED
- Currently 36 lines (only hls.js config fragment)
- Should be ~436 lines with all functions
- Need to restore complete working version

### 3. STREAM QUALITY ISSUES
- NFL/MLB/ABC News: Quality level playlists return 404 at source (Akamai)
- Proxy works correctly (200 OK for manifests that exist)
- hls.js needs config for SCTE-35 ad markers + High Profile H.264

### 4. STREAM HEALTH
- 76% of iptv-org channels have ZERO streams
- Only 1,209 channels have reliable CDN streams
- 2,351 streams from dead CDNs (jmp2.uk, messi.damitv.st)
- Need automatic dead stream detection + fallback

---

## FILES TO EXAMINE

### Primary (Must Fix)
```
D:\iptv-player\
├── app.js              # MAIN - currently BROKEN (36 lines)
├── index.html          # DOM structure
├── styles.css          # Virtual list CSS
├── worker.js           # Cloudflare Worker proxy (WORKING)
├── wrangler.toml       # Worker config
└── README.md
```

### Reference
```
D:\iptv-player-pro\     # React/TypeScript attempt (abandoned)
D:\iptv-player\AGENT_HANDOFF_DIAGNOSTIC.md  # Previous diagnostic
```

---

## DIAGNOSTIC STEPS FOR NEW AGENT

### Step 1: Restore app.js
```bash
# Check current state
cat D:\iptv-player\app.js | wc -l
# Should be ~436 lines, currently 36

# Restore from working version (check git history or rewrite)
```

### Step 2: Add Debug Logging
Add `console.log` to trace:
```javascript
// In applyFilters()
console.log('[applyFilters] allChannels:', allChannels.length, 'filtered:', filteredChannels.length)

// In renderVirtualList()
console.log('[renderVirtualList] totalItems:', filteredChannels.length)
```

### Step 3: Verify Filter Logic
Check `applyFilters()`:
```javascript
// Does c._source exist? (data uses c.source)
// Does activeSources.has(c._source) work?
// Is filteredChannels actually assigned?
```

### Step 4: Test Stream Health
```bash
# Test known working streams
curl -s -o /dev/null -w "%{http_code}" "https://iptv-stream-proxy.abetscrape.workers.dev/?u=https://propee33f9c2.airspace-cdn.cbsivideo.com/index.m3u8"
# Should return 200

# Test dead streams
curl -s -o /dev/null -w "%{http_code}" "https://abcnews-streams.akamaized.net/hls/live/2023560/abcnewshudson1/master_400.m3u8"
# Returns 404 - DEAD AT SOURCE
```

---

## REQUIRED FIXES

### 1. Restore Complete app.js (~436 lines)
Include all functions:
- `load()`, `loadAllSources()`, `loadSource()`
- `buildMaps()`, `populateCountries()`, `setupSourceToggles()`
- `applyFilters()`, `renderVirtualList()`
- `isReliable()`, `getStatus()`, `setStatus()`
- `loadStatusCache()`, `saveStatusCache()`
- `testStream()`, `startBackgroundTesting()`, `processQueue()`
- `proxyUrl()`, `findStream()`, `selectChannel()`
- `stopPlayback()`, `play()` with enhanced hls.js config
- `renderVirtualList()` with virtual scrolling
- Event listeners + `load()` call

### 2. Enhanced hls.js Config (for live streams with ads)
```javascript
hls = new Hls({
  enableWorker: true,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  liveSyncDuration: 30,
  liveMaxLatencyDuration: 60,
  forceKeyFrameOnDiscontinuity: true,
  fragLoadingTimeOut: 20000,
  fragLoadingMaxRetry: 6,
  capLevelToPlayerSize: true,
  startFragPrefetch: true,
});
```

### 3. Stream Health System
- Mark dead streams after 3 consecutive failures
- Auto-fallback to next stream for channel
- Visual indicators: 🟢 Working, 🔴 Dead, 🟡 Testing

### 3. Enable Free-TV/IPTV by Default
```javascript
let activeSources = new Set(['iptvorg', 'freeiptv']);  // Both enabled
```

### 4. Fix Filter Logic
- `c._source` vs `c.source` (data uses `c.source`)
- `c.alt_names` vs `c.altNames`
- Verify `activeSources.has(c.source)` works

---

## DEPLOYMENT COMMANDS

```bash
# Deploy frontend
cd D:\iptv-player && npx wrangler pages deploy . --project-name=iptv-player

# Deploy proxy (if changed)
cd D:\iptv-player && npx wrangler deploy

# Test locally
cd D:\iptv-player && python -m http.server 8000
# Open http://localhost:8000
```

---

## ACCOUNT PROVENANCE
- GitHub: abet-hq / abethq@proton.me
- Cloudflare: abetco.workers.dev (abetco account)
- Config: E:\abet\.env.account-registry.local
- Docs: E:\abet\docs\CLOUDFLARE_WORKERS_SPECIFICATION.md

---

## SUCCESS CRITERIA
- [ ] 41,076 channels load and display
- [ ] Filtered count > 0 (shows channels)
- [ ] CBS Sports HQ plays (known working)
- [ ] Search/filter/country toggles work
- [ ] Favorites persist (localStorage)
- [ ] Sidebar collapses (☰ button)
- [ ] Virtual scrolling smooth (41k channels)
- [ ] Deploy to Cloudflare Pages succeeds
- [ ] Proxy handles all stream types

---

## CONTEXT FOR NEW MODEL
This is a **vanilla JS IPTV player** (no React, no build step). 
- Single HTML file loads app.js + styles.css
- Cloudflare Worker proxy handles CORS + segment rewriting
- Zustand not used (vanilla state management)
- hls.js for HLS playback
- Data from iptv-org API + Free-TV/IPTV M3U

**The problem is NOT the proxy, NOT the data source, NOT the deployment.**
**The problem IS: app.js corrupted, filter logic broken, stream health not handled.**

Fix app.js → Fix filters → Add stream health → Deploy → Done.