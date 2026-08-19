import urllib.request, json

streams = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/streams.json'))

# Search for NBC/NBA related channels
for s in streams:
    ch = s.get('channel')
    if ch and ('nbc' in ch.lower() or 'nba' in ch.lower()):
        print(f"  {ch} | {s['url'][:80]}")