import urllib.request, json

channels = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/channels.json'))
streams = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/streams.json'))
blocklist = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/blocklist.json'))

print("=== CHANNELS ===")
for c in channels:
    id = c['id'].lower()
    if 'abc' in id or 'espn' in id or 'cnbc' in id or 'bbc' in id:
        print(f"  {c['id']} | {c['name']} | {c.get('country','')} | {c.get('categories',[])}")

print("\n=== STREAMS for these channels ===")
target_ids = {'abc.us', 'abcnews.us', 'espn.us', 'espn2.us', 'espn.classic.us', 'espnu.us', 'cnbc.us', 'bbcone.uk'}
for s in streams:
    if s['channel'] in target_ids:
        print(f"  {s['channel']} | {s['url']} | {s.get('user_agent','')} | {s.get('referrer','')}")

print("\n=== BLOCKLIST ===")
for b in blocklist:
    if b['channel'] in target_ids:
        print(f"  {b['channel']} | {b.get('reason','')}")