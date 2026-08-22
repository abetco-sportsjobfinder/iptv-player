// Streaming proxy + shared status/favorites cache for NEON STREAM.
//
// Changes vs previous revision:
// - OPTIONS preflight is answered BEFORE any route handling (preflight must
//   return 2xx or browsers block PUT entirely).
// - Allow-Methods now includes PUT and HEAD.
// - Playlist rewrites delete stale Content-Length/Encoding headers so rewritten
//   bodies don't trip net::ERR_CONTENT_LENGTH_MISMATCH.
// - Removed unused /remote WebSocket endpoint.
// - Optional write protection: set WRITE_TOKEN secret to require
//   "x-write-token" on PUT /api/* (leave unset to keep writes open).

function withCors(headers) {
  const h = new Headers(headers || {});
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Referer, User-Agent, x-write-token');
  h.set('Access-Control-Max-Age', '86400');
  return h;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 0) Preflight MUST be handled first: /api/* used to answer 405 here,
    //    which fails preflight and silently kills every browser PUT.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: withCors() });
    }

    // 1) Shared channel-status proof cache (KV).
    if (url.pathname === '/api/status') {
      if (request.method === 'GET') {
        let val = {};
        try { val = await env.STATUS.get('status', 'json') || {}; } catch (e) { }
        return new Response(JSON.stringify(val), { status: 200, headers: withCors({ 'Content-Type': 'application/json' }) });
      }
      if (request.method === 'PUT') {
        if (env.WRITE_TOKEN && request.headers.get('x-write-token') !== env.WRITE_TOKEN) {
          return new Response('forbidden', { status: 403, headers: withCors() });
        }
        let body = {};
        try { body = await request.json(); } catch (e) { }
        await env.STATUS.put('status', JSON.stringify(body));
        return new Response('ok', { status: 200, headers: withCors() });
      }
      return new Response('method not allowed', { status: 405, headers: withCors() });
    }

    // 2) Shared favorites (object map: id -> true).
    if (url.pathname === '/api/favorites') {
      if (request.method === 'GET') {
        let val = {};
        try { val = await env.STATUS.get('favorites', 'json') || {}; } catch (e) { }
        return new Response(JSON.stringify(val), { status: 200, headers: withCors({ 'Content-Type': 'application/json' }) });
      }
      if (request.method === 'PUT') {
        if (env.WRITE_TOKEN && request.headers.get('x-write-token') !== env.WRITE_TOKEN) {
          return new Response('forbidden', { status: 403, headers: withCors() });
        }
        let body = {};
        try { body = await request.json(); } catch (e) { }
        await env.STATUS.put('favorites', JSON.stringify(body));
        return new Response('ok', { status: 200, headers: withCors() });
      }
      return new Response('method not allowed', { status: 405, headers: withCors() });
    }

    // 3) Stream proxy.
    const target = url.searchParams.get('u');
    if (!target) {
      return new Response('Missing u parameter', { status: 400, headers: withCors({ 'Content-Type': 'text/plain' }) });
    }

    const referer = url.searchParams.get('r') || '';
    const ua = url.searchParams.get('ua') ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    const origin = url.origin;

    const upstreamHeaders = { 'Referer': referer, 'User-Agent': ua };
    const range = request.headers.get('Range');
    if (range) upstreamHeaders['Range'] = range;

    try {
      const resp = await fetch(target, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
      });

      const headers = new Headers(resp.headers);
      headers.set('Cache-Control', 'no-store');

      const isPlaylist = /\.m3u8(\?.*)?$/i.test(target) ||
        /\.m3u(\?.*)?$/i.test(target) ||
        (resp.headers.get('content-type') || '').includes('mpegurl');

      if (isPlaylist) {
        const text = await resp.text();
        let body = text;
        try {
          if (text.trimStart().startsWith('#EXTM3U')) {
            body = rewritePlaylist(text, target, origin, ua, referer);
          }
        } catch (rewriteErr) {
          body = text; // never fail playback on a malformed playlist
        }
        headers.set('Content-Type', 'application/vnd.apple.mpegurl');
        // Rewritten body no longer matches upstream framing headers.
        headers.delete('Content-Length');
        headers.delete('Content-Encoding');
        return new Response(body, { status: resp.status, headers: withCors(headers) });
      }

      return new Response(resp.body, { status: resp.status, headers: withCors(headers) });
    } catch (e) {
      return new Response('Proxy error: ' + e.message, { status: 502, headers: withCors({ 'Content-Type': 'text/plain' }) });
    }
  }
};

function selfProxy(origin, targetAbs, ua, referer) {
  const u = new URL(origin + '/');
  u.searchParams.set('u', targetAbs);
  if (ua) u.searchParams.set('ua', ua);
  if (referer) u.searchParams.set('r', referer);
  return u.toString();
}

function makeAbsolute(u, base) {
  try { return new URL(u, base).href; } catch { return u; }
}

function rewritePlaylist(text, baseUrl, origin, ua, referer) {
  return text.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (trimmed === '') return line;
    if (trimmed.startsWith('#') && trimmed.includes('URI=')) {
      return line.replace(/URI="([^"]*)"/g, (m, inner) => `URI="${selfProxy(origin, makeAbsolute(inner, baseUrl), ua, referer)}"`);
    }
    if (!trimmed.startsWith('#')) {
      return selfProxy(origin, makeAbsolute(trimmed, baseUrl), ua, referer);
    }
    return line;
  }).join('\n');
}
