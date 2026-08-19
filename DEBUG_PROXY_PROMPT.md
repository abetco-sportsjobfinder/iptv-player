=== DEBUG PROXY 502 + CORS PROMPT ===

CONTEXT: Independent IPTV Browser at D:\iptv-player. Deployed Cloudflare Worker proxy at https://iptv-stream-proxy.abetscrape.workers.dev. Browser requests to proxy return 502 + "CORS header 'Access-Control-Allow-Origin' missing".

WHAT SHOULD HAPPEN:
1. app.js proxyUrl() builds `https://iptv-stream-proxy.abetscrape.workers.dev/?u=<encoded stream URL>&ua=<user_agent>&ref=<referrer>`
2. Worker receives request, fetches upstream stream, rewrites HLS playlist (relative segments → absolute proxied URLs), injects `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`
3. Browser plays via HLS.js or native

WHAT'S BROKEN:
- Network tab shows 502 from proxy + CORS error (no ACAO header on error response)
- Test streams: ABC.us (http://190.11.225.124:5000/live/abc_hd/playlist.m3u8), ESPN-U-HD (http://85.237.89.160:9590/usa-s/ESPN-U-HD/index.m3u8)
- Both are real iptv-org sources; ABC.us is http-only, ESPN-U-HD is http

FILES TO INSPECT (D:\iptv-player):
1. worker.js — MUST handle OPTIONS preflight, set CORS headers on ALL responses (success + error), fetch upstream, rewritePlaylist() for .m3u8, pass through other content
2. wrangler.toml — check name, route, compatibility_date
3. app.js proxyUrl() — verify encoding, param names (u, ua, ref)

SPECIFIC DEBUG TASKS:
A. Add console.log in worker.js fetch handler to log incoming URL, upstream status, errors. Redeploy and check worker logs (wrangler tail or dashboard).
B. Ensure worker responds to OPTIONS with 204 + CORS headers.
C. Ensure rewritePlaylist() doesn't throw on malformed playlists; wrap in try/catch, return original on error.
D. Verify upstream fetch uses correct headers (User-Agent, Referer from query params).
E. Test proxy directly in browser: `https://iptv-stream-proxy.abetscrape.workers.dev/?u=http://190.11.225.124:5000/live/abc_hd/playlist.m3u8` — should return rewritten playlist with proxied segment URLs and CORS headers.

KNOWN STATE:
- app.js PROXY constant = 'https://iptv-stream-proxy.abetscrape.workers.dev' ✓
- worker.js has rewritePlaylist() (hy3 audit) but may not set CORS on error paths
- wrangler.toml exists; deploy succeeded to abetscrape.workers.dev (not abetco)
- No C:\ refs; D:\ only

DELIVERABLE FROM DEBUG AGENT:
- Exact worker.js fix (CORS headers on all responses, OPTIONS handler, error handling)
- Exact wrangler.toml fix if needed
- Confirmation that direct proxy URL returns 200 + rewritten playlist + ACAO:*
- Steps to verify: hard refresh localhost:8000, click ABC.us, verify playback starts

DO NOT CHANGE app.js PROXY constant. DO NOT REMOVE SOURCES. FIX WORKER.