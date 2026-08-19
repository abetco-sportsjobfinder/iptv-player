import urllib.request, json

channels = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/channels.json'))
streams = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/streams.json'))
blocklist = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/blocklist.json'))

# Find exact IDs
print("=== Exact channel IDs ===")
for c in channels:
    name = c['name'].lower()
    if name in ['abc', 'espn', 'cnbc', 'bbc one']:
        print(f"  {c['id']} | {c['name']} | {c.get('country','')}")

# Check streams by exact channel ID
print("\n=== Streams for exact IDs ===")
for s in streams:
    if s['channel'] in ['abc.us', 'espn.us', 'cnbc.us', 'bbcone.uk', 'abcnewslive.us', 'espn2.us', 'espnu.us']:
        print(f"  {s['channel']} | {s['url']}")

# Check blocklist by exact channel ID
print("\n=== Blocklist for exact IDs ===")
for b in blocklist:
    if b['channel'] in ['abc.us', 'espn.us', 'cnbc.us', 'bbcone.uk', 'abcnewslive.us', 'espn2.us', 'espnu.us']:
        print(f"  {b['channel']} | {b.get('reason','')}")

# Check all US sports channels with streams
print("\n=== US sports channels WITH streams ===")
us_sports = [c['id'] for c in channels if c.get('country') == 'US' and 'sports' in c.get('categories',[])]
for s in streams:
    if s['channel'] in us_sports:
        print(f"  {s['channel']} | {s['url'][:80]}")