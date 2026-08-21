const API = 'https://iptv-org.github.io/api';
const PROXY = 'https://iptv-stream-proxy.abetscrape.workers.dev';
const channelsUrl = `${API}/channels.json`;
const streamsUrl = `${API}/streams.json`;
const blocklistUrl = `${API}/blocklist.json`;

const SOURCES = {
  iptvorg: {
    name: 'IPTV-org',
    enabled: true,
    channelsUrl,
    streamsUrl,
    blocklistUrl,
    type: 'api'
  },
  freeiptv: {
    name: 'Free-TV/IPTV (Pluto, Samsung, etc.)',
    enabled: true,
    m3uUrl: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    type: 'm3u'
  }
};

let allChannels = [];
let allStreams = [];
let blocklist = new Map();
let channelMap = new Map();
let streamStatus = new Map();
let hls;
let countries = new Set();
let favorites = new Set();
let loadTimer = null;
let loadResolved = false;
let currentId = null;
let playAttempts = 0;
let filteredChannels = [];
let renderWindow = {start: 0, end: 0};
let activeSources = new Set(Object.keys(SOURCES).filter(k => SOURCES[k].enabled));
let channelRank = new Map();
let logoMap = new Map();
let testingQueue = [];
let isTesting = false;
let statusSaveTimer = null;
let remoteDirty = false;
let remoteTimer = null;
let refreshLoop = true;
let simpleMode = false;
let streamsByChannel = new Map();
function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  const base = 0x1F1E6; // 🇦
  const a = upper.charCodeAt(0);
  const b = upper.charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return '';
  return String.fromCodePoint(base + a - 65, base + b - 65);
}

const ITEM_HEIGHT = 56;
const BUFFER = 10;
const GOOD_CDNS = ['cloudfront.net', 'akamaized.net', 'akamaihd.net', 'amagi.tv', 'wurl.tv', 'tubi.video', 'pb-', 'aegis-cloudfront', 'airspace-cdn', 'fastly.net', 'd1m1xk35ma8qfl.cloudfront.net', 'pluto.tv'];
const BAD_CDNS = ['jmp2.uk', 'messi.damitv.st'];
const STATUS_TTL = 7 * 24 * 60 * 60 * 1000;

async function load() {
  const cached = loadStatusCache();
  streamStatus = new Map(cached);

  await loadAllSources();
  buildMaps();
  allChannels.forEach(c => { if (!c.provider) c.provider = inferProvider(c); });
  computeRanks();
  populateCountries();
  populateProviders();
try {
    favorites = new Set(JSON.parse(localStorage.getItem('iptv_favs') || '[]'));
  } catch (e) { favorites = new Set(); }
  // Load favorites from KV (shared across browsers/devices)
  try {
    const res = await fetch(`${PROXY}/api/favorites`);
    if (res.ok) {
      const data = await res.json();
      // Merge: keep local entries that are newer, otherwise use KV
      for (const [id, entry] of Object.entries(data)) {
        const local = streamStatus.get(id);
        if (!local || entry.time > (local.time || 0)) {
          // just mark as favorite if in KV
        }
      }
      // Actually, use KV favorites as override: if entry is "working" or present, consider favored
      // Simpler: just load the Set from KV
      const kvFavs = new Set(Object.keys(data).filter(k => data[k]));
      // Prefer KV over local: KV wins
      favorites = kvFavs;
    }
  } catch (e) { }
  // Explicitly uncheck filter toggles to prevent browser restoring checked state
  document.getElementById('favToggle').checked = false;
  document.getElementById('reliableToggle').checked = false;
  document.getElementById('workingToggle').checked = false;
  applyFilters();
  updateStats();
  loadLogos();
  startBackgroundTesting();
  setupSourceToggles();
}

const R2_LOGO_URL = 'https://YOUR_ACCOUNT.r2.cloudflarestorage.com/logos.json'; // <-- set this after enabling R2

async function loadLogos() {
  // Lazy logo loading: only load logos.json on demand for visible channels
  // Don't preload entire 2.9MB file
  logoMap = new Map(); // Empty initially
  renderVirtualList();
  
  // Preload a small sample for initial render
  setTimeout(async () => {
    try {
      const res = await fetch('logos.json');
      if (res.ok) {
        const data = await res.json();
        // Only load first 500 logos to reduce memory
        const entries = Object.entries(data).slice(0, 500);
        logoMap = new Map(entries);
        renderVirtualList();
      }
    } catch (e) { /* silent fail */ }
  }, 2000);
}

function updateStats() {
  const el = document.getElementById('stats');
  if (!el) return;
  let w = 0, d = 0;
  for (const [id] of streamStatus) {
    const s = getStatus(id);
    if (s === 'working') w++;
    else if (s === 'dead') d++;
  }
  const total = allChannels.filter(c => (channelRank.get(c.id) ?? 2) < 2).length;
  if (simpleMode) {
    el.textContent = `● ${w.toLocaleString()} LIVE • ${filteredChannels.length.toLocaleString()} SHOWS`;
  } else {
    el.textContent = `🟢 ${w.toLocaleString()} working • 🔴 ${d.toLocaleString()} dead • ⚪ ${(total - w - d).toLocaleString()} untested • ${total.toLocaleString()} with streams`;
  }
}

async function loadAllSources() {
  const enabledSources = Object.entries(SOURCES).filter(([_, s]) => s.enabled);
  const results = await Promise.all(enabledSources.map(([key, s]) => loadSource(s, key)));

  allChannels = results.flatMap(r => r.channels);
  allStreams = results.flatMap(r => r.streams);
  blocklist = new Map();
  for (const r of results) {
    if (r.blocklist) {
      for (const [k, v] of r.blocklist) blocklist.set(k, v);
    }
  }
}

async function loadSource(source, sourceId) {
  if (source.type === 'api') {
    const [chRes, stRes, blRes] = await Promise.all([
      fetch(source.channelsUrl), fetch(source.streamsUrl), fetch(source.blocklistUrl)
    ]);
    const channelsData = await chRes.json();
    const streamsData = await stRes.json();
    const blocklistData = await blRes.json();

    const channels = channelsData.map(c => ({
      id: c.id, name: c.name, country: c.country, categories: c.categories || [],
      logo: c.logo, source: sourceId, altNames: c.alt_names, blocked: false, provider: c.network || ''
    }));
    const streams = streamsData.map(s => ({
      channelId: s.channel, url: s.url, userAgent: s.user_agent, referrer: s.referrer, source: sourceId
    }));
    const blocklist = new Map(blocklistData.map(b => [b.channel, b.reason || 'blocked']));
    return { channels, streams, blocklist };
  } else {
    const res = await fetch(source.m3uUrl);
    const text = await res.text();
    return parseM3U(text, sourceId);
  }
}

function parseM3U(text, sourceId) {
  const channels = [];
  const streams = [];
  const lines = text.split('\n');
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('#EXTINF:')) {
      const attrs = parseExtinf(line);
      const name = attrs.name || 'Unknown Channel';
      const ch = {
        id: attrs['tvg-id'] || name.replace(/[^a-z0-9]/gi, '').toLowerCase(),
        name,
        country: attrs['tvg-country'] || '',
        categories: attrs['group-title'] ? [attrs['group-title']] : [],
        logo: attrs['tvg-logo'] || '',
        source: sourceId,
        altNames: attrs['tvg-id'] ? [attrs['tvg-id']] : undefined,
        blocked: false,
        provider: ''
      };
      channels.push(ch);
    } else if (line && !line.startsWith('#')) {
      const lastChannel = channels[channels.length - 1];
      if (lastChannel) {
        streams.push({
          channelId: lastChannel.id,
          url: line,
          source: sourceId
        });
      }
    }
  }
  return { channels, streams };
}

function parseExtinf(line) {
  const attrs = {};
  let name = 'Unknown Channel';
  const match = line.match(/#EXTINF:-?\d+(?:\s+(.*))?,(.*)/);
  if (match) {
    const attrStr = match[1] || '';
    const n = match[2] || '';
    name = n.trim();
    const attrRegex = /(\w+)="([^"]*)"/g;
    let m;
    while ((m = attrRegex.exec(attrStr)) !== null) {
      if (m[1]) attrs[m[1]] = m[2] || '';
    }
    return { name, attrs };
  }
  return { name: 'Unknown Channel', attrs: {} };
}

function buildMaps() {
  channelMap.clear();
  countries.clear();
  allChannels.forEach(c => {
    channelMap.set(c.id, c);
    if (c.country) countries.add(c.country);
  });
  buildStreamsIndex();
}

function inferProvider(ch) {
  if (ch.provider) return ch.provider;
  const streams = streamsByChannel.get(ch.id) || [];
  for (const s of streams) {
    try {
      const h = new URL(s.url).hostname;
      if (h.includes('pluto.tv') || h.includes('unreel.me')) return 'Pluto TV';
      if (h.includes('amagi.tv')) {
        if (h.includes('samsung')) return 'Samsung TV Plus';
        if (h.includes('plex')) return 'Plex';
        return 'Amagi';
      }
      if (h.includes('wurl.tv')) return 'Wurl';
      if (h.includes('tubi.video')) return 'Tubi';
      if (h.includes('youtube.com')) return 'YouTube';
      if (h.includes('xumo')) return 'Xumo';
      if (h.includes('roku')) return 'Roku';
      if (h.includes('skygo.mn')) return 'Sky Go';
      if (h.includes('streamlock.net')) return 'StreamLock';
    } catch { }
  }
  return '';
}

function computeRanks() {
  channelRank = new Map();
  const byChannel = new Map();
  for (const s of allStreams) {
    if (!s.url || !/^https?:\/\//.test(s.url)) continue;
    if (s.url.includes('youtube.com') || s.url.includes('.mpd')) continue;
    if (!byChannel.has(s.channelId)) byChannel.set(s.channelId, []);
    byChannel.get(s.channelId).push(s);
  }
  allChannels.forEach(c => {
    const streams = byChannel.get(c.id) || [];
    let rank = 2;
    if (streams.length) rank = 1;
    if (streams.some(s => GOOD_CDNS.some(cdn => s.url.includes(cdn)) && !BAD_CDNS.some(bad => s.url.includes(bad)))) rank = 0;
    channelRank.set(c.id, rank);
  });
  allChannels.sort((a, b) => (channelRank.get(a.id) ?? 2) - (channelRank.get(b.id) ?? 2));
}

function populateProviders() {
  const counts = new Map();
  allChannels.forEach(c => {
    if (c.provider) counts.set(c.provider, (counts.get(c.provider) || 0) + 1);
  });
  const sel = document.getElementById('provider');
  sel.innerHTML = '<option value="">All providers</option>';
  Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).forEach(([name, n]) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `${name} (${n})`;
    sel.appendChild(opt);
  });
}

function populateCountries() {
  const sel = document.getElementById('country');
  sel.innerHTML = '<option value="">All countries</option>';
  const sorted = Array.from(countries).sort((a, b) => {
    if (a === 'US') return -1;
    if (b === 'US') return 1;
    return a.localeCompare(b);
  });
  sorted.forEach(cc => {
    const opt = document.createElement('option');
    opt.value = cc;
    opt.textContent = cc;
    sel.appendChild(opt);
  });
}

function setupSourceToggles() {
  const container = document.getElementById('sourceToggles');
  Object.entries(SOURCES).forEach(([key, src]) => {
    const label = document.createElement('label');
    label.style.marginRight = '12px';
    const checked = activeSources.has(key);
    label.innerHTML = `<input type="checkbox" data-source="${key}" ${checked ? 'checked' : ''}> Enable ${src.name}`;
    label.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) activeSources.add(key); else activeSources.delete(key);
      applyFilters();
    });
    container.appendChild(label);
  });
}

function applyFilters() {
  const q = document.getElementById('search').value.toLowerCase();
  const country = document.getElementById('country').value;
  const provider = document.getElementById('provider').value;
  const showFavsOnly = document.getElementById('favToggle').checked;
  const reliableOnly = document.getElementById('reliableToggle').checked;
  const workingOnly = document.getElementById('workingToggle').checked;

  filteredChannels = allChannels.filter(c => {
    if (!activeSources.has(c.source)) return false;
    if (showFavsOnly && !favorites.has(c.id)) return false;
    if (country && c.country !== country) return false;
    if (provider && c.provider !== provider) return false;
    if (reliableOnly && !isReliable(c.id)) return false;
    if (workingOnly && getStatus(c.id) !== 'working') return false;
    const nameMatch = c.name.toLowerCase().includes(q) || (c.altNames || []).some(a => a.toLowerCase().includes(q));
    return nameMatch;
  });
  renderWindow = {start: 0, end: 0};
  renderVirtualList();
}

function isReliable(channelId) {
  const streams = streamsByChannel.get(channelId) || [];
  return streams.some(s => s.url && /^https?:\/\//.test(s.url) &&
    !s.url.includes('youtube.com') && !s.url.includes('.mpd') &&
    GOOD_CDNS.some(cdn => s.url.includes(cdn)) &&
    !BAD_CDNS.some(bad => s.url.includes(bad)));
}

function getStatus(channelId) {
  const cached = streamStatus.get(channelId);
  if (!cached) return 'unknown';
  const age = Date.now() - cached.time;
  if (cached.status === 'dead') return age < 3 * 24 * 60 * 60 * 1000 ? 'dead' : 'unknown';
  if (age < 7 * 24 * 60 * 60 * 1000) return cached.status;
  return 'unknown';
}

function setStatus(channelId, status, reason) {
  const prev = streamStatus.get(channelId);
  streamStatus.set(channelId, { status, time: Date.now(), reason: reason || (prev && prev.reason) });
  if (statusSaveTimer) clearTimeout(statusSaveTimer);
  statusSaveTimer = setTimeout(saveStatusCache, 1000);
  remoteDirty = true;
  if (remoteTimer) clearTimeout(remoteTimer);
  remoteTimer = setTimeout(flushRemoteStatus, 60000);
}

async function loadRemoteStatus() {
  try {
    const res = await fetch(`${PROXY}/api/status`);
    if (!res.ok) return;
    const data = await res.json();
    for (const [id, entry] of Object.entries(data)) {
      const local = streamStatus.get(id);
      if (!local || (entry.time || 0) > (local.time || 0)) {
        streamStatus.set(id, { status: entry.status, time: entry.time || Date.now(), reason: entry.reason || '' });
      }
    }
  } catch (e) { }
}

async function flushRemoteStatus() {
  if (!remoteDirty) return;
  remoteDirty = false;
  try {
    const body = JSON.stringify(Object.fromEntries(streamStatus));
    const res = await fetch(`${PROXY}/api/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) remoteDirty = true;
  } catch (e) { remoteDirty = true; }
}

function loadStatusCache() {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem('iptv_stream_status') || '{}'))); }
  catch { return new Map(); }
}

function saveStatusCache() {
  localStorage.setItem('iptv_stream_status', JSON.stringify(Object.fromEntries(streamStatus)));
}

async function testStream(channelId) {
  const streams = (streamsByChannel.get(channelId) || []).filter(s => s.url);
  if (!streams.length) { setStatus(channelId, 'dead', 'no_streams'); return; }

  for (const s of streams) {
    if (!/^https?:\/\//.test(s.url)) { continue; }
    if (s.url.includes('youtube.com') || s.url.includes('.mpd')) { continue; }
    const proxied = proxyUrl(s.url, s.userAgent, s.referrer);
    const isPlaylist = /\.m3u8(\?.*)?$/i.test(s.url) || /\.m3u(\?.*)?$/i.test(s.url);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
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
            reason = res.ok || res.status === 206 ? 'range_ok' : `http_${res.status}`;
          } else {
            reason = res.ok || res.status === 206 ? 'head_ok' : `http_${res.status}`;
          }
          ok = res.ok || res.status === 206;
        }
        clearTimeout(timeout);
        if (ok) { setStatus(channelId, 'working', reason); return; }
        setStatus(channelId, 'dead', reason);
      } catch (e) {
        setStatus(channelId, 'dead', 'timeout');
      }
    }
  }
}

function startBackgroundTesting() {
  if (isTesting) return;
  isTesting = true;
  testingQueue = allChannels
    .filter(c => (channelRank.get(c.id) ?? 2) < 2 && getStatus(c.id) === 'unknown')
    .map(c => c.id);
  processQueue();
}

async function processQueue() {
  while (testingQueue.length > 0) {
    const batch = testingQueue.splice(0, 2); // Reduced from 4 to 2 concurrent tests
    await Promise.all(batch.map(id => testStream(id)));
    renderVirtualList();
    updateStats();
    await new Promise(r => setTimeout(r, 1500)); // Increased delay from 700ms to 1500ms
  }
  isTesting = false;
}

function proxyUrl(url, ua, ref) {
  const p = new URL(PROXY);
  p.searchParams.set('u', url);
  if (ua) p.searchParams.set('ua', ua);
  if (ref) p.searchParams.set('r', ref);
  return p.toString();
}

function findStreamCandidates(channelId) {
  const allForChannel = streamsByChannel.get(channelId) || [];
  const candidates = allForChannel.filter(s => s.url && /^https?:\/\//.test(s.url) &&
    !s.url.includes('youtube.com') && !s.url.includes('.mpd'));
  if (!candidates.length) return [];
  const httpsCandidates = candidates.filter(s => s.url.startsWith('https://') && !BAD_CDNS.some(bad => s.url.includes(bad)));
  const pool = httpsCandidates.length ? httpsCandidates : candidates.filter(s => !BAD_CDNS.some(bad => s.url.includes(bad)));
  const good = pool.filter(s => GOOD_CDNS.some(cdn => s.url.includes(cdn)));
  return [...good, ...pool.filter(s => !good.includes(s))];
}

function findStream(channelId) {
  return findStreamCandidates(channelId)[0] || null;
}

function selectChannel(id, el) {
  currentId = id;
  playAttempts = 0;
  const reason = blocklist.get(id);
  if (reason) {
    document.getElementById('info').textContent = `Blocked: ${channelMap.get(id)?.name || id} • ${reason}`;
    stopPlayback();
    return;
  }
  document.querySelectorAll('.channel').forEach(d => d.classList.remove('active'));
  if (el) el.classList.add('active');
  const ch = channelMap.get(id);
  const stream = findStream(id);
  const url = stream ? stream.url : null;
  if (!url) {
    document.getElementById('info').textContent = `${ch?.name || id} • No stream available`;
    stopPlayback();
    return;
  }
  const status = getStatus(id);
  document.getElementById('info').textContent = `${ch?.name || id} • ${ch?.country || ''} ${status !== 'unknown' ? `• ${status}` : ''}`;
  if (status === 'unknown') { setStatus(id, 'testing'); testStream(id).then(() => renderVirtualList()); }
  play(url, stream);
}

function stopPlayback() {
  clearTimeout(loadTimer);
  loadResolved = false;
  const video = document.getElementById('video');
  video.pause();
  video.removeAttribute('src');
  video.load();
  if (hls) { hls.destroy(); hls = null; }
}

function failPlayback(reason) {
  const candidates = currentId ? findStreamCandidates(currentId) : [];
  if (playAttempts < 3 && candidates[playAttempts]) {
    const next = candidates[playAttempts];
    document.getElementById('info').textContent = `${reason} — trying alternative stream...`;
    play(next.url, next);
  } else {
    document.getElementById('info').textContent = `${reason} — no more streams`;
    setStatus(currentId, 'dead');
    stopPlayback();
  }
}

function play(url, stream) {
  const video = document.getElementById('video');
  if (!url) { stopPlayback(); return; }
  stopPlayback();
  clearTimeout(loadTimer);
  loadResolved = false;
  playAttempts++;
  const proxied = proxyUrl(url, stream && stream.userAgent, stream && stream.referrer);
  console.log('[PLAY]', currentId, '->', proxied);
  video.onerror = () => failPlayback('Playback error: network or CORS');
  video.onplaying = () => {
    loadResolved = true;
    playAttempts = 0;
    setStatus(currentId, 'working');
    const ch = channelMap.get(currentId);
    document.getElementById('info').textContent = `${ch?.name || ''} • Playing • ${ch?.country || ''}`;
    renderVirtualList();
  };
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = proxied;
    video.play().catch(() => {});
  } else if (window.Hls && Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      liveSyncDuration: 30,
      liveMaxLatencyDuration: 60,
      liveDurationInfinity: false,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      highBufferWatchdogPeriod: 3,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      maxFragLookUpTolerance: 0.25,
      forceKeyFrameOnDiscontinuity: true,
      appendErrorMaxRetry: 3,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 6,
      fragLoadingMaxRetryTimeout: 1000,
      fragLoadingLoopThreshold: 3,
      startFragPrefetch: true,
      appendErrorMaxRetry: 3,
      capLevelToPlayerSize: true,
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      console.log('[HLS ERROR]', data.type, data.details, data.fatal, data.error ? data.error.message : '');
      if (data.fatal) {
        failPlayback(`HLS error: ${data.details}`);
      }
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => { if (playAttempts === 0) setStatus(currentId, 'working'); });
    hls.loadSource(proxied);
    hls.attachMedia(video);
    video.play().catch(() => {});
  } else {
    video.src = proxied;
  }
  loadTimer = setTimeout(() => {
    if (!loadResolved) {
      failPlayback('Load timeout — stream may be blocked');
    }
  }, 20000);
}

function renderVirtualList() {
  const list = document.getElementById('list');
  const scrollTop = list.scrollTop;
  const clientHeight = list.clientHeight;
  const totalItems = filteredChannels.length;

  if (totalItems === 0) {
    list.innerHTML = '<div class="empty">No channels match</div>';
    return;
  }

  const visibleStart = Math.floor(scrollTop / ITEM_HEIGHT);
  const visibleCount = Math.ceil(clientHeight / ITEM_HEIGHT);
  const newStart = Math.max(0, visibleStart - BUFFER);
  const newEnd = Math.min(totalItems, visibleStart + visibleCount + BUFFER);

  if (renderWindow.start === newStart && renderWindow.end === newEnd && list.children.length > 0) return;
  renderWindow = {start: newStart, end: newEnd};

  const totalHeight = totalItems * ITEM_HEIGHT;
  const beforeHeight = newStart * ITEM_HEIGHT;
  const afterHeight = totalHeight - newEnd * ITEM_HEIGHT;

  list.innerHTML = '';
  list.style.height = totalHeight + 'px';
  list.style.position = 'relative';

  if (beforeHeight > 0) {
    const spacer = document.createElement('div');
    spacer.className = 'list-placeholder';
    spacer.style.height = beforeHeight + 'px';
    list.appendChild(spacer);
  }

  const fragment = document.createDocumentFragment();
  for (let i = newStart; i < newEnd; i++) {
    const c = filteredChannels[i];
    const isBlocked = blocklist.has(c.id);
    const reason = blocklist.get(c.id);
    const isFav = favorites.has(c.id);
    const status = getStatus(c.id);
    const statusClass = status === 'working' ? 'status-ok' : status === 'dead' ? 'status-dead' : status === 'testing' ? 'status-testing' : '';
    const statusIcon = status === 'working' ? '🟢' : status === 'dead' ? '🔴' : status === 'testing' ? '🟡' : '⚪';

    const div = document.createElement('div');
    const rank = channelRank.get(c.id) ?? 2;
    div.className = 'channel' + (isBlocked ? ' blocked' : '') + (rank === 2 ? ' nostream' : '');
    div.dataset.id = c.id;
    div.style.height = ITEM_HEIGHT + 'px';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    const logoUrl = c.logo || logoMap.get(c.id) || '';
    const logoHtml = logoUrl
      ? `<img class="logo" src="${logoUrl}" loading="lazy" onerror="this.style.display='none'">`
      : `<span class="logo logo-fallback">${(c.name[0] || '?').toUpperCase()}</span>`;
    
    const metaParts = simpleMode 
      ? [c.provider].filter(Boolean)
      : [c.provider, countryFlag(c.country) + ' ' + c.country, (c.categories || []).join(', ')];
    
    div.innerHTML = `<span class="status-badge ${statusClass}">${statusIcon}</span>${logoHtml}<button class="fav-btn" data-id="${c.id}" title="Toggle favorite">${isFav ? '★' : '☆'}</button><div class="channel-info"><div class="name">${c.name}</div><div class="meta">${metaParts.filter(Boolean).join(' • ')}${isBlocked ? ` • BLOCKED` : ''}</div></div>`;
    div.onclick = (e) => {
      if (e.target.classList.contains('fav-btn')) {
        const id = e.target.dataset.id;
        if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
        scheduleFavoriteFlush();
        applyFilters();
      } else {
        selectChannel(c.id, div);
      }
    };
    fragment.appendChild(div);
  }
  list.appendChild(fragment);

  if (afterHeight > 0) {
    const spacer = document.createElement('div');
    spacer.className = 'list-placeholder';
    spacer.style.height = afterHeight + 'px';
    list.appendChild(spacer);
  }
}

document.getElementById('search').addEventListener('input', () => { clearTimeout(searchDebounce); searchDebounce = setTimeout(applyFilters, 150); });
document.getElementById('country').addEventListener('change', applyFilters);
document.getElementById('provider').addEventListener('change', applyFilters);
document.getElementById('favToggle').addEventListener('change', applyFilters);
document.getElementById('reliableToggle').addEventListener('change', applyFilters);
document.getElementById('workingToggle').addEventListener('change', () => { applyFilters(); startBackgroundTesting(); });
document.getElementById('topBtn').addEventListener('click', () => document.getElementById('list').scrollTop = 0);
document.getElementById('bottomBtn').addEventListener('click', () => { const el = document.getElementById('list'); el.scrollTop = el.scrollHeight; });
document.getElementById('sidebarToggle').addEventListener('click', () => document.querySelector('main').classList.toggle('collapsed'));
document.getElementById('list').addEventListener('scroll', renderVirtualList, {passive: true});

// CYBERPUNK UX ENHANCEMENTS
const simpleToggle = document.getElementById('simpleModeToggle');
if (simpleToggle) {
  simpleMode = localStorage.getItem('iptv_simple_mode') === 'true';
  if (simpleMode) {
    document.body.classList.add('simplified');
    simpleToggle.textContent = 'Advanced Mode';
  }
  simpleToggle.addEventListener('click', () => {
    simpleMode = !simpleMode;
    document.body.classList.toggle('simplified', simpleMode);
    localStorage.setItem('iptv_simple_mode', simpleMode);
    simpleToggle.textContent = simpleMode ? 'Advanced Mode' : 'Simple Mode';
    setTimeout(applyFilters, 100);
  });
}

// Quick Categories for Simple Mode
const quickCats = document.getElementById('quickCategories');
if (quickCats) {
  quickCats.addEventListener('click', () => {
    const cats = ['Kids', 'News', 'Sports', 'Movies', 'Music', 'Children'];
    const chosen = prompt('Pick category:\n' + cats.join('\n'), 'Kids');
    if (chosen) {
      document.getElementById('search').value = chosen;
      applyFilters();
    }
  });
}

// Mobile bottom nav handlers
document.getElementById('navFavs')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('favToggle').checked = true;
  applyFilters();
});
document.getElementById('navSearch')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('sidebarToggle').click();
  document.getElementById('search').focus();
});
document.getElementById('navMore')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.querySelector('main').classList.toggle('collapsed');
});

// Improve error messages for non-technical users
const originalPlay = selectChannel;
function selectChannel(id, el) {
  try {
    originalPlay(id, el);
  } catch (e) {
    updateChannelStatus('Finding another signal...', 'testing');
    console.error(e);
  }
}

// Build streams index for performance
function buildStreamsIndex() {
  streamsByChannel.clear();
  for (const s of allStreams) {
    if (!streamsByChannel.has(s.channelId)) {
      streamsByChannel.set(s.channelId, []);
    }
    streamsByChannel.get(s.channelId).push(s);
  }
}

let favoriteFlushTimer = null;
function scheduleFavoriteFlush() {
  if (favoriteFlushTimer) clearTimeout(favoriteFlushTimer);
  favoriteFlushTimer = setTimeout(flushFavoriteFavorites, 60000);
}

async function flushFavoriteFavorites() {
  try {
    const body = JSON.stringify(Array.from(favorites));
    await fetch(`${PROXY}/api/favorites`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (e) { }
}

let searchDebounce = null;

function updateChannelStatus(message, type = 'info') {
  const el = document.getElementById('channelStatus');
  if (!el) return;
  el.textContent = `● ${message.toUpperCase()}`;
  el.style.color = type === 'error' ? '#ff4444' : type === 'testing' ? 'var(--neon-cyan)' : 'var(--neon-lime)';
}

// Override play error messages
const originalPlay = window.selectChannel || null;

load();