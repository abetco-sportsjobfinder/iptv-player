#!/usr/bin/env node
/**
 * Exhaustive channel test → seeds Cloudflare KV proof cache.
 * Run: node seed_kv.js
 * Takes ~30 min for ~10k channels with streams.
 */

const PROXY = 'https://iptv-stream-proxy.abetscrape.workers.dev';
const STATUS_API = PROXY + '/api/status';
const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 700;
const TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 2;

const GOOD_CDNS = [
  'cloudfront.net', 'akamaized.net', 'akamaihd.net', 'amagi.tv',
  'wurl.tv', 'tubi.video', 'pb-', 'aegis-cloudfront', 'airspace-cdn',
  'fastly.net', 'd1m1xk35ma8qfl.cloudfront.net', 'pluto.tv'
];
const BAD_CDNS = ['jmp2.uk', 'messi.damitv.st'];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function proxyUrl(url, ua, ref) {
  const params = new URLSearchParams({ u: url });
  if (ua) params.set('ua', ua);
  if (ref) params.set('ref', ref);
  return `${PROXY}?${params.toString()}`;
}

function isGoodCdn(url) {
  try {
    const host = new URL(url).hostname;
    return GOOD_CDNS.some(cdn => host.includes(cdn)) && !BAD_CDNS.some(bad => host.includes(bad));
  } catch { return false; }
}

function parseM3U(text) {
  const streams = [];
  const lines = text.split('\n');
  let current = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#EXTINF:')) {
      const match = trimmed.match(/#EXTINF:-?\d+(?: ([^=]+)="([^"]*)")*,(.*)/);
      if (match) {
        current = { name: match[3].trim() };
        const attrs = {};
        const attrRegex = /([^=]+)="([^"]*)"/g;
        let m;
        while ((m = attrRegex.exec(trimmed))) attrs[m[1]] = m[2];
        if (attrs['tvg-id']) current.id = attrs['tvg-id'];
        if (attrs['tvg-logo']) current.logo = attrs['tvg-logo'];
        if (attrs['group-title']) current.category = attrs['group-title'];
        if (attrs['tvg-country']) current.country = attrs['tvg-country'];
      }
    } else if (trimmed.startsWith('#EXTGRP:')) {
      current.category = trimmed.slice(8).trim();
    } else if (!trimmed.startsWith('#')) {
      if (current.id || current.name) {
        streams.push({ ...current, url: trimmed });
        current = {};
      }
    }
  }
  return streams;
}

async function testStream(url, ua, ref) {
  const proxied = proxyUrl(url, ua, ref);
  const isPlaylist = /\.m3u8(\?.*)?$/i.test(url) || /\.m3u(\?.*)?$/i.test(url);
  
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let ok = false;
      let reason = '';
      
      if (isPlaylist) {
        const res = await fetch(proxied, { signal: controller.signal });
        if (res.ok) {
          const text = await res.text();
          ok = text.trimStart().startsWith('#EXTM3U');
          reason = ok ? 'm3u8_ok' : 'not_m3u8';
        } else {
          reason = `http_${res.status}`;
        }
      } else {
        let res = await fetch(proxied, { method: 'HEAD', signal: controller.signal });
        if (res.status === 405 || res.status === 403) {
          res = await fetch(proxied, { headers: { 'Range': 'bytes=0-1023' }, signal: controller.signal });
          reason = (res.ok || res.status === 206) ? 'range_ok' : `http_${res.status}`;
        } else {
          reason = (res.ok || res.status === 206) ? 'head_ok' : `http_${res.status}`;
        }
        ok = res.ok || res.status === 206;
      }
      clearTimeout(timeout);
      if (ok) return { status: 'working', reason };
    } catch (e) {
      if (attempt === MAX_ATTEMPTS - 1) return { status: 'dead', reason: 'timeout' };
    }
  }
  return { status: 'dead', reason: 'failed_all_attempts' };
}

async function testChannel(channel, streams) {
  // Prefer good-CDN streams first
  const sorted = [...streams].sort((a, b) => isGoodCdn(b.url) - isGoodCdn(a.url));
  
  for (const s of sorted) {
    if (!/^https?:\/\//.test(s.url)) continue;
    if (s.url.includes('youtube.com') || s.url.includes('.mpd')) continue;
    const result = await testStream(s.url, s.userAgent, s.referrer);
    if (result.status === 'working') return { status: 'working', reason: result.reason };
  }
  return { status: 'dead', reason: 'no_working_stream' };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('📥 Loading channel data...');
  
  // 1) iptv-org channels
  const iptvChannels = await fetchJson('https://iptv-org.github.io/api/channels.json');
  const iptvStreams = await fetchJson('https://iptv-org.github.io/api/streams.json');
  const iptvByChannel = new Map();
  for (const s of iptvStreams) {
    if (!iptvByChannel.has(s.channel)) iptvByChannel.set(s.channel, []);
    iptvByChannel.get(s.channel).push(s);
  }
  
  // 2) Free-TV playlist
  let freeStreams = [];
  try {
    const plText = await fetchText('https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8');
    freeStreams = parseM3U(plText);
    console.log(`   Free-TV: ${freeStreams.length} streams`);
  } catch (e) {
    console.warn('   Free-TV fetch failed:', e.message);
  }
  const freeByChannel = new Map();
  for (const s of freeStreams) {
    const id = s.id || s.name;
    if (!freeByChannel.has(id)) freeByChannel.set(id, []);
    freeByChannel.get(id).push(s);
  }
  
  // 3) Build test list: all channels that have at least one stream
  const testList = [];
  for (const ch of iptvChannels) {
    const streams = iptvByChannel.get(ch.id) || [];
    if (streams.length) testList.push({ id: ch.id, name: ch.name, streams, source: 'iptv' });
  }
  for (const [id, streams] of freeByChannel) {
    if (streams.length) testList.push({ id, name: streams[0].name || id, streams, source: 'free' });
  }
  
  console.log(`🎯 ${testList.length} channels to test`);
  
  // 4) Load existing KV cache (if any)
  let kvCache = {};
  try {
    const res = await fetch(STATUS_API);
    if (res.ok) kvCache = await res.json();
    console.log(`📦 Existing KV entries: ${Object.keys(kvCache).length}`);
  } catch (e) { console.warn('KV load failed:', e.message); }
  
  // 5) Filter out already-tested (working within 7d, dead within 3d)
  const now = Date.now();
  const toTest = testList.filter(t => {
    const cached = kvCache[t.id];
    if (!cached) return true;
    const age = now - (cached.time || 0);
    if (cached.status === 'working' && age < 7*24*60*60*1000) return false;
    if (cached.status === 'dead' && age < 3*24*60*60*1000) return false;
    return true;
  });
  
  console.log(`⏭️  Skipping ${testList.length - toTest.length} recently-tested channels`);
  console.log(`🔬 Testing ${toTest.length} channels...`);
  
  // 6) Test loop
  const results = { ...kvCache };
  let tested = 0;
  let working = 0;
  let dead = 0;
  
  for (let i = 0; i < toTest.length; i += BATCH_SIZE) {
    const batch = toTest.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(t => testChannel(t, t.streams).then(r => ({ id: t.id, ...r }))));
    
    for (const r of batchResults) {
      results[r.id] = { status: r.status, time: now, reason: r.reason };
      tested++;
      if (r.status === 'working') working++; else dead++;
    }
    
    // Periodic flush to KV
    if (tested % 50 === 0) {
      await fetch(STATUS_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results),
      });
      console.log(`   💾 Flushed ${tested}/${toTest.length} (🟢${working} 🔴${dead})`);
    }
    
    if (i + BATCH_SIZE < toTest.length) await sleep(BATCH_DELAY_MS);
  }
  
  // 7) Final flush
  await fetch(STATUS_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results),
  });
  
  console.log(`\n✅ Done! Tested: ${tested} | Working: ${working} | Dead: ${dead}`);
  console.log(`📊 Total KV entries: ${Object.keys(results).length}`);
}

main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });