import asyncio
import httpx
import json

async def fetch_route():
    url = "http://127.0.0.1:8000/api/routing/route?profile=driving&start_lat=28.64&start_lng=77.33&end_lat=28.58&end_lng=77.32"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        data = resp.json()
        print("Distance:", data.get('distance_meters'))
        print("Duration (Original):", data.get('duration_original'))
        print("Duration (Simulated):", data.get('duration_seconds'))
        geom = data.get('geometry', {})
        print("Feature Type:", geom.get('type'))
        features = geom.get('features', [])
        print(f"Total Segments: {len(features)}")
        if len(features) > 0:
            print("Sample Feature Properties:", features[0]['properties'])
            
        # Count congestions
        congestions = {'low': 0, 'moderate': 0, 'heavy': 0}
        for f in features:
            prop = f.get('properties', {})
            c = prop.get('congestion')
            if c: congestions[c] += 1
        print("Traffic Distribution:", congestions)

if __name__ == "__main__":
    asyncio.run(fetch_route())
