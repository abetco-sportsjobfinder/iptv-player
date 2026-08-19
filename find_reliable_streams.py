import urllib.request, json

streams = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/streams.json'))

# Find HTTPS streams from known good CDNs
good_cdns = ['cloudfront.net', 'akamaized.net', 'akamaihd.net', 'amagi.tv', 'wurl.tv', 'tubi.video', 'pb-', 'aegis-cloudfront']
print("=== HTTPS streams from reliable CDNs ===")
count = 0
for s in streams:
    if s['url'].startswith('https://') and any(cdn in s['url'] for cdn in good_cdns):
        print(f"  {s['channel']} | {s['url']}")
        count += 1
        if count > 100:
            break

print(f"\nTotal: {count}")