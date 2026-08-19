// Ensure every response — success, error, preflight, or missing-param —
// carries CORS headers, or the browser blocks it before reading the body.
function withCors(headers) {
  const h = new Headers(headers || {});
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Referer, User-Agent');
  return h;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    console.log('[proxy] method=%s path=%s', request.method, url.pathname);

    // 0) Shared status log backed by Cloudflare KV (durable proof cache).
    if (url.pathname === '/api/status') {
      if (request.method === 'GET') {
        let val = {};
        try { val = await env.STATUS.get('status', 'json') || {}; } catch (e) { }
        return new Response(JSON.stringify(val), {
          status: 200,
          headers: withCors({ 'Content-Type': 'application/json' }),
        });
      }
      if (request.method === 'PUT') {
        let body = {};
        try { body = await request.json(); } catch (e) { }
        await env.STATUS.put('status', JSON.stringify(body));
        return new Response('ok', { status: 200, headers: withCors() });
      }
      return new Response('method not allowed', { status: 405, headers: withCors() });
    }

    // 2) Favorites cache (shared across browsers/devices).
    if (url.pathname === '/api/favorites') {
      if (request.method === 'GET') {
        let val = {};
        try { val = await env.STATUS.get('favorites', 'json') || {}; } catch (e) { }
        return new Response(JSON.stringify(val), {
          status: 200,
          headers: withCors({ 'Content-Type': 'application/json' }),
        });
      }
      if (request.method === 'PUT') {
        let body = {};
        try { body = await request.json(); } catch (e) { }
        await env.STATUS.put('favorites', JSON.stringify(body));
        return new Response('ok', { status: 200, headers: withCors() });
      }
      return new Response('method not allowed', { status: 405, headers: withCors() });
    }

    // 3) Phone‑as‑remote WebSocket endpoint.
    if (url.pathname === '/remote' && request.method === 'GET' && request.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      request.acceptWebSocket(pair[0]);
      pair[1].addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[remote]', data);
        } catch {}
      });
      pair[1].addEventListener('close', () => console.log('[remote] closed'));
      return new Response(null, { status: 101 });
    }

    // 1) Preflight must be answered BEFORE any upstream fetch.
    if (request.method === 'OPTIONS') {
      console.log('[proxy] OPTIONS preflight -> 204');
      return new Response(null, { status: 204, headers: withCors() });
    }

    const target = url.searchParams.get('u');
    if (!target) {
      console.log('[proxy] missing u param -> 400');
      return new Response('Missing u parameter', {
        status: 400,
        headers: withCors({ 'Content-Type': 'text/plain' }),
      });
    }
    console.log('[proxy] target=%s', target);

    const referer = url.searchParams.get('r') || '';
    const ua = url.searchParams.get('ua') ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    const origin = url.origin; // this worker's own origin

    const upstreamHeaders = {
      'Referer': referer,
      'User-Agent': ua,
    };
    const range = request.headers.get('Range');
    if (range) upstreamHeaders['Range'] = range;

    try {
      const resp = await fetch(target, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
      });
      console.log('[proxy] upstream status=%s type=%s', resp.status, resp.headers.get('content-type'));

      const headers = new Headers(resp.headers);
      headers.set('Cache-Control', 'no-store');

      const isPlaylist = /\.m3u8(\?.*)?$/i.test(target) ||
        /\.m3u(\?.*)?$/i.test(target) ||
        (resp.headers.get('content-type') || '').includes('mpegurl');

      if (isPlaylist) {
        // Read the body once; reuse `text` for both rewrite and fallback.
        const text = await resp.text();
        let body = text;
        try {
          if (text.trimStart().startsWith('#EXTM3U')) {
            body = rewritePlaylist(text, target, origin, ua, referer);
          }
        } catch (rewriteErr) {
          // Never crash on a malformed playlist — serve the original with CORS.
          console.log('[proxy] rewrite failed, serving original: %s', rewriteErr.message);
          body = text;
        }
        headers.set('Content-Type', 'application/vnd.apple.mpegurl');
        return new Response(body, { status: resp.status, headers: withCors(headers) });
      }

      return new Response(resp.body, { status: resp.status, headers: withCors(headers) });
    } catch (e) {
      // Upstream fetch failed (blocked port, network, timeout). The 502 MUST
      // still carry ACAO, or the browser throws a CORS error and hides the body.
      console.log('[proxy] upstream fetch error: %s', e.message);
      return new Response('Proxy error: ' + e.message, {
        status: 502,
        headers: withCors({ 'Content-Type': 'text/plain' }),
      });
    }
  }
};

// Build a self-referential proxied URL for a segment / nested playlist.
function selfProxy(origin, targetAbs, ua, referer) {
  const u = new URL(origin + '/');
  u.searchParams.set('u', targetAbs);
  if (ua) u.searchParams.set('ua', ua);
  if (referer) u.searchParams.set('r', referer);
  return u.toString();
}

function makeAbsolute(u, base) {
  try {
    return new URL(u, base).href;
  } catch {
    return u;
  }
}

function rewritePlaylist(text, baseUrl, origin, ua, referer) {
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    const trimmed = line.trim();
    if (trimmed === '') return line;
    // Tag attributes like URI="..." (EXT-X-MEDIA, EXT-X-KEY, EXT-X-I-FRAME-STREAM-INF, ...)
    if (trimmed.startsWith('#') && trimmed.includes('URI=')) {
      return line.replace(/URI="([^"]*)"/g, (m, inner) => {
        const abs = makeAbsolute(inner, baseUrl);
        return `URI="${selfProxy(origin, abs, ua, referer)}"`;
      });
    }
    // Bare URI line: a segment (.ts) or a nested playlist (.m3u8).
    if (!trimmed.startsWith('#')) {
      const abs = makeAbsolute(trimmed, baseUrl);
      return selfProxy(origin, abs, ua, referer);
    }
    return line;
  }).join('\n');
}
