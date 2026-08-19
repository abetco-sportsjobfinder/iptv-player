=== EXHAUSTIVE AUDIT PROMPT ===

PROJECT: Independent IPTV Browser (D:\iptv-player)
ORIGIN: Built during interactive session with user complaining of "miserable failure"
OWNER: abet-hq / abethq@proton.me (E:\abet\.env.account-registry.local)
ASSETS: abetco.workers.dev (Cloudflare), abethq (HuggingFace)
DOCUMENTATION SOURCE: E:\abet\docs (CLOUDFLARE_WORKERS_SPECIFICATION.md etc.)

REQUIREMENTS (NON-NEGOTIABLE FROM SESSION):
- Independent from iptv-org UI; reads public JSON APIs only
- Built ONLY on D:\ (C:\ forbidden)
- NO real stream sources eliminated (all http/https kept; https preferred but not exclusive)
- Blocked status PROVEN from live blocklist.json (not assumed); shows reason (dmca/nsfw)
- Sticky search remains visible during scroll
- Country filter dropdown with US at top
- Favorites tagging with localStorage persistence + checkbox filter
- Jump to top/bottom list navigation
- Clean playback teardown: destroy HLS, remove src, pause before new load
- No overlapping network requests; no perpetual loading (timeout after 8s implemented)
- Error messages clear (Blocked: X • reason / No stream available / Playback error / HLS error / Load timeout — deploy proxy?)
- Published URL not yet live (proxy not deployed; local only at localhost:8000)

FILES TO AUDIT (D:\iptv-player):
1. index.html
2. styles.css
3. app.js
4. worker.js
5. wrangler.toml
6. README.md
7. .github/workflows/pages.yml

CODE EVALUATION CHECKS:
- Does app.js load channels/streams/blocklist from iptv-org.github.io/api?
- Is favorites implemented via localStorage and rendered as star buttons (★/☆)?
- Does renderList filter by country, favorites checkbox, and search while excluding nothing except blocklist proof?
- Does findStream keep all https AND http sources? (Verify no https-only restriction leftover)
- Does selectChannel handle blocked channels cleanly with message showing reason from blocklist Map?
- Does play() validate absolute URLs, call stopPlayback(), set error handlers, create HLS with maxBufferLength 30, and set 8-second timeout showing deploy message?
- Does stopPlayback() fully destroy HLS instance and remove video src?
- Does the event listener wire search, country dropdown, favorites checkbox, jump buttons?
- Does index.html link styles.css and include controls with sticky positioning?

DEPLOYMENT / INFRA EVALUATION:
- Is .github/workflows/pages.yml present with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets?
- Does wrangler.toml define name=iptv-stream-proxy and route=proxy.abetco.workers.dev/*?
- Does worker.js set Access-Control-Allow-Origin: * and inject Referer / User-Agent headers?
- Is README.md documenting provenance (env.account-registry.local, docs folder), architecture, data flow, deployment checklist?
- Are there references to C:\ anywhere? Must be zero.
- Does README mention MIT license vs CC0 upstream data? No stream redistribution?

DATA / STREAM REALITY CHECKS (USE LIVE DATA):
- Fetch https://iptv-org.github.io/api/blocklist.json; verify ESPN.us is present with reason dmca; verify ESPN.br/in/nl status
- Fetch streams.json; verify ESPN.br has URLs; ESPN.in/nl have zero
- Verify ABC - US stream URL: http://190.11.225.124:5000/live/abc_hd/playlist.m3u8 exists but requires CORS header (proves source is real, failure is provider-side not code failure)
- Verify BBC One.uk has streams

PERFORMANCE / BUG IDENTIFICATION:
- Confirm perpetual HLS retry loop is eliminated by timeout (8s) in play()
- Confirm no duplicate XHR from overlapping selectChannel clicks
- Identify any remaining source of Invalid URI localhost:8000 (likely empty src or relative URL handling)
- Confirm CORS error for ABC appears in console but does not crash UI; user sees timeout message
- Confirm country dropdown renders US first due to custom sort

DOCUMENTATION / MYSTERY ELIMINATION:
- Can a new agent understand from README.md alone how to deploy, which account owns the repo, where docs live, what the architecture is, and why proxy is required?
- Is every file referenced with full path?
- Is the hand-off prompt (AUDIT_PROMPT.md) included in repo?

FAILURE POINTS TO REPORT:
- Any leftover https-only filter in findStream
- Any leftover reference to C:\
- Any missing localStorage persistence
- Any broken event listener wiring
- Any missing error message for CORS/network (must say deploy proxy explicitly)
- Any absence of account registry reference in README
- Any stream that exists in API but not tested by UI (test at least BBC One, ESPN.br, ABC US)

FINAL DELIVERABLE FROM AUDIT AGENT:
- Confirm D:\ is only path used
- Confirm all 7 files present and syntactically valid
- Confirm favorites persist locally and filter works
- Confirm US at top of country list
- Confirm blocklist shown with reason
- Confirm no real sources removed
- Confirm timeout stops perpetual loading
- Confirm README has full provenance
- List any remaining bugs with specific file/line reference
- State clearly: is proxy deployment the ONLY remaining blocker for full playback, or are there code bugs?

DO NOT REMOVE ANY REAL SOURCE. DO NOT ASSUME BLOCK. PROVE FROM API. DOCUMENT EVERYTHING.
