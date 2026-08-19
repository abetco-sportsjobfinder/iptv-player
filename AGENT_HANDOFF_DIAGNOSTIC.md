# IPTV Player - Exhaustive Diagnostic Document for Agent Handoff

## Executive Summary
**Status: BROKEN - No channels loading**
- Last working version: D:\iptv-player (vanilla JS, deployed at https://9fc7dd2d.iptv-player-20g.pages.dev)
- Current broken version: D:\iptv-player (after hls.js config edit corrupted app.js, then attempted restore)
- React rewrite attempt: D:\iptv-player-pro (abandoned, too complex)

---

## Project Structure

### D:\iptv-player (Vanilla JS - Last Known Working)
```
D:\iptv-player\
├── index.html          # Main HTML
├── app.js              # Main application (436 lines - currently BROKEN)
├── styles.css          # Styling
├── worker.js           # Cloudflare Worker proxy
├── wrangler.toml       # Worker config
├── README.md           # Documentation
├── .github/workflows/pages.yml  # CI/CD
├── inspect_iptv.py     # Data inspection script
├── DEBUG_PROXY_PROMPT.md
├── DEBUG_403_PROMPT.md
├── AUDIT_PROMPT.md
└── DEBUG_403_PROMPT.md
```

### D:\iptv-player-pro (React/TypeScript - Abandoned)
- Complex React/TS/Zustand architecture
- Build works but not deployed
- Path: D:\iptv-player-pro

---

## Current State (BROKEN)

### Symptoms
- **No channels load** - filteredCount shows 0
- **Console shows**: `[APP INIT] Loaded: { channels: 41076, streams: 16588, blocklist: 1420 }` but then filteredCount stays 0
- **app.js syntax**: Valid (no syntax errors)
- **Data loads**: 41,076 channels, 16,588 streams, 1,420 blocklist entries
- **Active sources**: Only "iptvorg" enabled

### Root Cause Hypothesis
The `applyFilters()` function or `renderVirtualList()` has a logic error after the hls.js config edit and restore. The `filteredChannels` array becomes empty despite data loading correctly.

### Key Files to Inspect
1. **D:\iptv-player\app.js** - Main logic (436 lines)
   - `applyFilters()` function (lines ~163-179)
   - `renderVirtualList()` function (lines ~349-436)
   - `computeFilteredChannels()` missing from store
2. **D:\iptv-player\index.html** - DOM structure
3. **D:\iptv-player\styles.css** - Virtual list CSS

---

## Data Sources & Verification

### IPTV-org API (Primary)
- **Channels**: https://iptv-org.github.io/api/channels.json (41,076)
- **Streams**: https://iptv-org.github.io/api/streams.json (16,588)
- **Blocklist**: https://iptv-org.github.io/api/blocklist.json (1,420)
- **Logos**: https://iptv-org.github.io/api/logos.json

### Free-TV/IPTV (Secondary - M3U)
- **Playlist**: https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8
- Contains: Pluto TV, Samsung TV Plus, and 2000+ other channels
- **Parsing**: `parseM3U()` in app.js

### Verified Working Streams (via proxy)
| Channel | Stream URL | Status |
|---------|------------|--------|
| CBS Sports HQ | `https://propee33f9c2.airspace-cdn.cbsivideo.com/index.m3u8` | ✅ Works |
| MLB | `https://pb-2y9ox4r1fy550.akamaized.net/playlist.m3u8` | ⚠️ HLS errors |
| NFL Network | `https://pb-we3ltka9xobj6.akamaized.net/master.m3u8` | ⚠️ HLS errors |
| NFL Channel | `https://pb-we3ltka9xobj6.akamaized.net/master.m3u8` | ⚠️ HLS errors |
| NHL Network | `https://nhl-firetv.amagi.tv/playlist.m3u8` | ✅ Works |
| CBS Sports | `https://proped3fhg87.airspace-cdn.cbsivideo.com/golazo...` | ✅ Works |

### Proxy Status
- **Worker**: https://iptv-stream-proxy.abetscrape.workers.dev
- **Status**: ✅ Working (200 OK for manifests & segments)
- **CORS**: ✅ `Access-Control-Allow-Origin: *`
- **Segment rewriting**: ✅ Working (relative → absolute via proxy)

---

## Architecture Overview (Vanilla JS)

### Core Modules
1. **Data Loading** (`load()`, `loadAllSources()`, `loadSource()`)
   - Loads IPTV-org API + Free-TV/IPTV M3U
   - Builds `allChannels[]`, `allStreams[]`, `blocklist Map`

2. **Filtering** (`applyFilters()`)
   - Filters by: active sources, favorites, country, reliable CDN, working status, search query
   - Updates `filteredChannels[]`

3. **Virtual List Rendering** (`renderVirtualList()`)
   - Only renders visible items (+10 buffer)
   - Uses spacer divs for scroll position
   - 56px item height, 10 item buffer

4. **Stream Selection** (`findStream()`)
   - Prefers HTTPS + GOOD_CDNS, excludes BAD_CDNS
   - Returns stream object with url, userAgent, referrer

5. **Playback** (`play()`, `HlsPlayer`)
   - Proxies stream via Cloudflare Worker
   - hls.js with enhanced config for live streams
   - 8s timeout fallback

6. **Stream Testing** (`testStream()`, `testStreamsBatch()`)
   - Background HEAD requests via proxy
   - Caches results in localStorage (24h TTL)
   - Only runs when "Show tested working only" enabled

7. **State Management**
   - `streamStatus Map` with 24h TTL cache in localStorage
   - `favorites Set` persisted in localStorage
   - `activeSources Set` for source toggles

---

## Deployment

### Cloudflare Pages (Frontend)
- **Project**: iptv-player-20g
- **URL pattern**: https://<hash>.iptv-player-20g.pages.dev
- **Deploy**: `npx wrangler pages deploy . --project-name=iptv-player`

### Cloudflare Workers (Proxy)
- **Project**: iptv-stream-proxy
- **URL**: https://iptv-stream-proxy.abetscrape.workers.dev
- **Deploy**: `npx wrangler deploy` (from D:\iptv-player)

---

## Account Provenance
```
GitHub: abet-hq / abethq@proton.me
HuggingFace: abethq
Cloudflare: abetco.workers.dev (abetco account)
Local config: E:\abet\.env.account-registry.local
Docs: E:\abet\docs\CLOUDFLARE_WORKERS_SPECIFICATION.md
```

---

## Known Issues to Fix

### 1. CRITICAL: Channels not loading (filteredCount = 0)
- **Location**: `applyFilters()` or `renderVirtualList()`
- **Evidence**: Data loads (41k channels) but filteredCount = 0
- **Check**: `applyFilters()` logic, `filteredChannels` assignment, `renderVirtualList()` early return

### 2. NFL/MLB HLS Errors
- **Cause**: SCTE-35 ad markers (`#EXT-X-CUE-OUT-CONT`) + High Profile H.264
- **Partial fix**: Enhanced hls.js config deployed
- **Test**: Check `[HLS ERROR]` in console for `manifestParsingError` or `bufferAppendError`

### 3. Free-TV/IPTV Source Not Enabled by Default
- **Fix**: Enable `freeiptv` source by default in `activeSources`

### 3. M3U Parsing Edge Cases
- Some EXTINF lines missing tvg-id, tvg-country
- `parseExtinf()` handles missing attributes

---

## Files for Agent Review

### Primary (Must Fix)
1. **D:\iptv-player\app.js** - Complete application logic
2. **D:\iptv-player\index.html** - DOM structure
3. **D:\iptv-player\styles.css** - Virtual list styling

### Reference
4. **D:\iptv-player\worker.js** - Proxy worker (working)
5. **D:\iptv-player\README.md** - Architecture docs
6. **D:\iptv-player\AUDIT_PROMPT.md** - Previous audit criteria

---

## Quick Test Checklist for Agent

```bash
# 1. Deploy current broken version
cd D:\iptv-player && npx wrangler pages deploy . --project-name=iptv-player

# 2. Open deployed URL, open DevTools Console (F12)
# 3. Look for:
#    [APP INIT] Loaded: { channels: 41076, ... }
#    [APP RENDER] { channelsCount: 41076, filteredCount: 0 }  ← BUG HERE
#    [CHANNELLIST RENDER] { filteredCount: 0, ... }

# 4. Check Network tab - any failed requests?
# 5. Check filteredChannels logic in applyFilters()
```

---

## Rebuild Strategy (If Needed)

### Option A: Fix Vanilla JS (Recommended - 30 min)
1. Fix `applyFilters()` logic error
2. Verify `renderVirtualList()` doesn't early-return incorrectly
3. Test with `console.log` in `applyFilters()`

### Option B: Complete React Rebuild (2-4 hours)
- Use D:\iptv-player-pro as base
- Fix path aliases, TypeScript errors
- Deploy to new Pages project

### Option C: Minimal Vanilla Rewrite (1 hour)
- Single HTML file with embedded JS/CSS
- No build step, direct deploy
- Simpler debugging

---

## Contact / Escalation
- **GitHub Issues**: Create in abet-hq/iptv-player
- **Logs**: Cloudflare Workers logs via `wrangler tail`
- **Proxy Debug**: `curl -v https://iptv-stream-proxy.abetscrape.workers.dev/?u=<url>`

---

## Appendix: Key Code Snippets

### applyFilters() - SUSPECT FUNCTION
```javascript
function applyFilters() {
  const q = document.getElementById('search').value.toLowerCase();
  const country = document.getElementById('country').value;
  const showFavsOnly = document.getElementById('favToggle').checked;
  const reliableOnly = document.getElementById('reliableToggle').checked;
  const workingOnly = document.getElementById('workingToggle').checked;

  filteredChannels = allChannels.filter(c => {
    if (!activeSources.has(c._source)) return false;
    if (showFavsOnly && !favorites.has(c.id)) return false;
    if (country && c.country !== country) return false;
    if (reliableOnly && !isReliable(c.id)) return false;
    if (workingOnly && getStatus(c.id) !== 'working') return false;
    const nameMatch = c.name.toLowerCase().includes(q) || (c.alt_names || []).some(a => a.toLowerCase().includes(q));
    return nameMatch;
  });
  renderWindow = {start: 0, end: 0};
  renderVirtualList();
}
```

### renderVirtualList() - SUSPECT FUNCTION
```javascript
function renderVirtualList() {
  const list = document.getElementById('list');
  const scrollTop = list.scrollTop;
  const clientHeight = list.clientHeight;
  const totalItems = filteredChannels.length;

  if (totalItems === 0) {  // ← MAYBE RETURNING EARLY HERE?
    list.innerHTML = '<div class="empty">No channels match</div>';
    return;
  }
  // ... virtual list rendering
}
```

---

**END OF DOCUMENT**