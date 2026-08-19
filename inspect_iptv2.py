import urllib.request, json

streams = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/streams.json'))
blocklist = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/blocklist.json'))

print("=== STREAMS for target channels ===")
target_ids = {'abc.us', 'abcnews.us', 'espn.us', 'espn2.us', 'espn.classic.us', 'espnu.us', 'cnbc.us', 'bbcone.uk', 'abcnewslive.us'}
for s in streams:
    if s['channel'] in target_ids:
        print(f"  {s['channel']} | {s['url']} | ua={s.get('user_agent','')} | ref={s.get('referrer','')}")

print("\n=== ALL BLOCKLIST entries for these ===")
for b in blocklist:
    if b['channel'] in target_ids:
        print(f"  {b['channel']} | {b.get('reason','')}")

print("\n=== Total streams count ===")
print(f"  {len(streams)} total streams")
print(f"  {len(blocklist)} total blocklist entries")

# Check a few that should work
print("\n=== BBC One UK streams ===")
for s in streams:
    if s['channel'] == 'bbcone.uk':
        print(f"  {s['url']} | ua={s.get('user_agent','')} | ref={s.get('referrer','')}")

print("\n=== ABC US streams ===")
for s in streams:
    if s['channel'] == 'abc.us':
        print(f"  {s['url']} | ua={s.get('user_agent','')} | ref={s.get('referrer','')}")

print("\n=== ESPN US streams ===")
for s in streams:
    if s['channel'] == 'espn.us':
        print(f"  {s['url']} | ua={s.get('user_agent','')} | ref={s.get('referrer','')}")