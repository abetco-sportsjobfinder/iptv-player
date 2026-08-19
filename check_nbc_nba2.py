import urllib.request, json

streams = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/streams.json'))

# Search for NBC/NBA related channels
for s in streams:
    ch = s.get('channel', '').lower()
    if 'nbc' in ch or 'nba' in ch:
        print(f"  {s['channel']} | {s['url'][:80]}")