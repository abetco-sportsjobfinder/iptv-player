import urllib.request, json

streams = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/streams.json'))

# Check NBC Sports Bay Area and NBA TV streams with headers
for s in streams:
    if s['channel'] in ['NBCSportsBayArea.us', 'NBATV.us']:
        print(f"  {s['channel']} | {s['url']}")
        print(f"    ua: {s.get('user_agent', 'NONE')}")
        print(f"    ref: {s.get('referrer', 'NONE')}")