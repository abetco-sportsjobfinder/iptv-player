import urllib.request, json

streams = json.load(urllib.request.urlopen('https://iptv-org.github.io/api/streams.json'))

# Check NBC Sports Bay Area and NBA TV
targets = ['nbcsportsbayarea.us', 'nbatv.us', 'nbcsportsnow.us', 'nbcsportsphiladelphia.us', 'nbcsportsboston.us', 'nbcsportscalifornia.us', 'nbcsportschicago.us', 'nbcsportswashington.us']
for s in streams:
    if s['channel'] in targets:
        print(f"  {s['channel']} | {s['url']} | ua={s.get('user_agent','')} | ref={s.get('referrer','')}")