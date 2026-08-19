import urllib.request, json

streams = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/streams.json'))

# Check structure
print("=== First 5 streams ===")
for i, s in enumerate(streams[:5]):
    print(f"  {i}: channel={repr(s.get('channel'))} url={s.get('url','')[:80]}")

# Count streams with empty/missing channel
empty_channel = sum(1 for s in streams if not s.get('channel'))
print(f"\nStreams with empty/missing channel: {empty_channel} / {len(streams)}")

# Check for ABC/ESPN/CNBC streams specifically
print("\n=== Looking for ABC/ESPN/CNBC in streams ===")
for s in streams:
    ch = s.get('channel', '')
    if ch and ('abc' in ch.lower() or 'espn' in ch.lower() or 'cnbc' in ch.lower()):
        print(f"  {ch} | {s['url'][:80]}")