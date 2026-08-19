# IPTV Org Independent Browser

Independent, cloud-hosted IPTV channel browser built on top of iptv-org public data.

## Purpose
Provide a published URL with a searchable channel list and on-demand HLS playback, without depending on iptv-org's own UI.

## Architecture
* **Data source**: iptv-org public API
  * https://iptv-org.github.io/api/channels.json
  * https://iptv-org.github.io/api/streams.json
  * https://iptv-org.github.io/api/blocklist.json
  * https://iptv-org.github.io/api/logos.json
* **UI**: Static HTML/JS hosted on Cloudflare Pages
* **Stream proxy**: Cloudflare Worker to inject Referer / User-Agent and bypass CORS
* **CI/CD**: GitHub Actions → Cloudflare Pages
* **Assets**: HuggingFace Spaces optional for demo

## Repositories
* GitHub owner: `abet-hq`  / email: abethq@proton.me  [E:\abet\.env.account-registry.local]
* Code repo: `abet-hq/iptv-browser`
* Pages deployment: Cloudflare Pages linked to GitHub repo, project `iptv-browser`
* Worker deployment: Cloudflare Workers `iptv-stream-proxy` at `proxy.abetco.workers.dev`

## Provenance
* GitHub account source: `E:\abet\.env.account-registry.local` GITHUB_ABETHQ_USERNAME=abet-hq
* HuggingFace account source: `E:\abet\.env.account-registry.local` HF_ABETHQ_USERNAME=abethq
* All docs in `E:\abet\docs` confirm active Cloudflare Workers infra at `abetco.workers.dev`

## Data flow
1. UI loads channels + streams + blocklist from iptv-org API at runtime
2. Blocked channels are kept in the list and tagged `BLOCKED:<reason>` (from blocklist.json); clicking one shows the block reason instead of loading a stream
3. On channel select, UI routes the stream URL through the Worker proxy (`PROXY + '?u=' + encodeURIComponent(url)`) to bypass provider CORS
4. Worker fetches the stream URL with proper Referer/User-Agent headers, adds `Access-Control-Allow-Origin: *`, and rewrites relative `.m3u8` segments/playlists back through itself; streams the body back to the player
5. HLS.js plays the proxied HLS in the browser; an 8s safety timer stops perpetual loading if playback never starts

## Deployment checklist
* [ ] Create GitHub repo `abet-hq/iptv-browser`
* [ ] Push `index.html`, `app.js`, `styles.css`, `worker.js`, `wrangler.toml`
* [ ] Add GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
* [ ] Connect repo to Cloudflare Pages project `iptv-browser`
* [ ] Deploy Worker via `wrangler deploy` → `proxy.abetco.workers.dev`
* [ ] Verify `PROXY` URL in `app.js` matches deployed worker
* [ ] Test with a non-blocked channel that has http(s) HLS streams, e.g. `ABC.us` (http-only, must go through proxy) or `BBCOne.uk` (note: id is `BBCOne.uk`, not `BBC One.uk`)

## License
UI code is MIT. Channel/stream data remains CC0 from iptv-org. No redistribution of streams.

## Notes
ESPN.us and others are DMCA blocked in iptv-org blocklist, therefore no stream will be available.
