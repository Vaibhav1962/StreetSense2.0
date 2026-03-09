import urllib.request
import json
import urllib.parse

def test_search(q, viewbox=None, bounded=0, limit=50):
    url = f"https://nominatim.openstreetmap.org/search?format=json&q={urllib.parse.quote(q)}&limit={limit}"
    if viewbox:
        url += f"&viewbox={viewbox}&bounded={bounded}"
    req = urllib.request.Request(url, headers={'User-Agent': 'StreetSenseTest/1.0'})
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(f"--- Query: {q} | Viewbox: {viewbox} | Bounded: {bounded} ---")
            for item in data[:10]:
                print(f"- {item.get('name', item.get('display_name'))} ({item.get('type')}, {item.get('class')}) [Lat: {item['lat']}, Lon: {item['lon']}]")
            print(f"Total results: {len(data)}")
            print()
    except Exception as e:
        print(f"Error for {q}: {e}")

lon = 77.33
lat = 28.64
offset = 0.05
vb = f"{lon-offset},{lat+offset},{lon+offset},{lat-offset}"

test_search("[amenity=hospital]", viewbox=vb, bounded=1)
test_search("hospital", viewbox=vb, bounded=1)
