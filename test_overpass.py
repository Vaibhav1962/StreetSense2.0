import urllib.request
import json
import urllib.parse

def test_overpass(lat, lon, radius=5000):
    query = f"""
    [out:json][timeout:10];
    (
      node["amenity"="hospital"](around:{radius},{lat},{lon});
      way["amenity"="hospital"](around:{radius},{lat},{lon});
      relation["amenity"="hospital"](around:{radius},{lat},{lon});
    );
    out center;
    """
    url = f"https://overpass-api.de/api/interpreter?data={urllib.parse.quote(query)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'StreetSenseTest/1.0'})
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(f"--- Overpass {radius}m around {lat}, {lon} ---")
            elements = data.get('elements', [])
            for item in elements[:10]:
                tags = item.get('tags', {})
                name = tags.get('name', 'Unknown Hospital')
                ilat = item.get('lat') or item.get('center', {}).get('lat')
                ilon = item.get('lon') or item.get('center', {}).get('lon')
                print(f"- {name} [Lat: {ilat}, Lon: {ilon}]")
            
            # Check if Yashoda or Max is in the results
            found = []
            for item in elements:
                name = item.get('tags', {}).get('name', '').lower()
                if 'yashoda' in name or 'max' in name:
                    found.append(item.get('tags', {}).get('name'))
            print(f"Total results: {len(elements)}")
            print(f"Found specific: {found}")
            print()
    except Exception as e:
        print(f"Error: {e}")

lon = 77.33
lat = 28.64
test_overpass(lat, lon, 5000)
test_overpass(lat, lon, 10000)
