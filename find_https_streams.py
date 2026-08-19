import urllib.request, json

streams = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/streams.json'))

# Find all HTTPS streams for US channels
print("=== HTTPS streams for US channels ===")
count = 0
for s in streams:
    if s['url'].startswith('https://'):
        print(f"  {s['channel']} | {s['url']}")
        count += 1
        if count > 50:
            break

print(f"\nTotal HTTPS streams shown: {count}")