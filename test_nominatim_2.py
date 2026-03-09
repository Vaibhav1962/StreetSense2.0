import urllib.request
import json
import urllib.parse

def test_search_lat_lon(q, lat, lon):
    url = f"https://nominatim.openstreetmap.org/search?format=json&q={urllib.parse.quote(q)}"
    url += f"&lat={lat}&lon={lon}&limit=10"
    req = urllib.request.Request(url, headers={'User-Agent': 'StreetSenseTest/1.0'})
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(f"--- Query: {q} | Lat: {lat} | Lon: {lon} ---")
            for item in data:
                print(f"- {item.get('name', item.get('display_name'))} [Lat: {item['lat']}, Lon: {item['lon']}]")
            print()
    except Exception as e:
        print(f"Error: {e}")

lon = 77.33
lat = 28.64
test_search_lat_lon("[amenity=hospital]", lat, lon)
test_search_lat_lon("hospital", lat, lon)
