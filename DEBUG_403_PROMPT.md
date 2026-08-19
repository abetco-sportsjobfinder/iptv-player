=== DEBUG 403 FROM UPSTREAM PROMPT ===

CONTEXT: Worker deployed at https://iptv-stream-proxy.abetscrape.workers.dev. Browser requests proxy → worker fetches upstream → upstream returns 403 Forbidden. Streams: ABC.us (http://190.11.225.124:5000/live/abc_hd/playlist.m3u8), ESPN-U-HD (http://85.237.89.160:9590/usa-s/ESPN-U-HD/index.m3u8). Both are http-only iptv-org sources.

CURRENT WORKER (D:\iptv-player\worker.js):
- Reads `u` (target), `r` (referer), `ua` (user-agent) from query params
- Forwards `Referer: r` and `User-Agent: ua` to upstream
- On 403, returns 403 to browser with CORS headers (browser shows HLS error: networkError)

APP.JS proxyUrl() (D:\iptv-player\app.js ~line 99):
```js
function proxyUrl(url, ua, ref) {
  const p = new URL(PROXY);
  p.searchParams.set('u', url);
  if (ua) p.searchParams.set('ua', ua);
  if (ref) p.searchParams.set('r', ref);
  return p.toString();
}
```
Called from `play()` with `stream?.user_agent`, `stream?.referrer` from streams.json.

ROOT CAUSE HYPOTHESES:
1. streams.json records for these channels have NO `user_agent`/`referrer` fields → worker sends default UA + empty Referer → upstream rejects.
2. Upstream blocks all Cloudflare IP ranges (common for pirate streams).
3. Upstream requires specific headers (Cookie, X-Forwarded-For, etc.) not forwarded.
4. The streams are simply dead/geoblocked.

DEBUG TASKS FOR AGENT:
A. Inspect streams.json for ABC.us and ESPN-U-HD channel IDs — do they have `user_agent`/`referrer`?
   - Fetch https://iptv-org.github.io/api/streams.json, filter by channel ID.
B. Test upstream directly with curl from non-Cloudflare IP (your machine) with same headers worker sends:
   ```bash
   curl -H "Referer: " -H "User-Agent: Mozilla/5.0..." "http://190.11.225.124:5000/live/abc_hd/playlist.m3u8"
   ```
   If 403 → upstream blocks default UA/empty Referer.
C. If streams have custom headers, ensure `proxyUrl()` passes them correctly.
D. If Cloudflare IPs blocked, consider: (a) different proxy host, (b) direct playback fallback (but CORS), (c) accept these streams are unplayable.
E. Add worker logging: log upstream response headers on 403 to see `Server`, `Via`, etc.

DELIVERABLE:
- Confirmation: do streams have headers? If yes, fix `proxyUrl()` to pass them.
- If no headers and upstream blocks defaults → document unplayable, show "Stream blocked by provider" in UI.
- If Cloudflare blocked → note limitation; no code fix without non-CF proxy.

FILES: D:\iptv-player\worker.js, app.js, DEBUG_PROXY_PROMPT.md (previous)