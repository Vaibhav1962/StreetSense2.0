from fastapi import APIRouter, Query
from typing import Optional
import httpx
import math
import hashlib
from datetime import datetime
import pytz

from app.core.config import settings

router = APIRouter()

OSRM_BASE = "http://router.project-osrm.org"


def _mapbox_to_feature_collection(route: dict) -> tuple[dict, float, float]:
    """Build our GeoJSON FeatureCollection from Mapbox response. Returns (fc, distance, duration)."""
    features = []
    total_dist = 0
    total_dur = 0
    for leg in route.get("legs", []):
        coords = leg.get("geometry", {}).get("coordinates", [])
        congestion_arr = leg.get("annotation", {}).get("congestion", []) or []
        duration_arr = leg.get("annotation", {}).get("duration", []) or []
        distance_arr = leg.get("annotation", {}).get("distance", []) or []
        for i in range(len(coords) - 1):
            seg_coords = [coords[i], coords[i + 1]]
            cong = (congestion_arr[i] if i < len(congestion_arr) else "unknown").lower()
            if cong not in ("heavy", "moderate"):
                cong = "low"
            dur = float(duration_arr[i]) if i < len(duration_arr) else 0
            dist = float(distance_arr[i]) if i < len(distance_arr) else 0
            total_dist += dist
            total_dur += dur
            features.append({
                "type": "Feature",
                "properties": {"congestion": cong, "duration_original": dur, "duration_simulated": dur, "distance": dist},
                "geometry": {"type": "LineString", "coordinates": seg_coords},
            })
    return {"type": "FeatureCollection", "features": features}, total_dist, total_dur


async def _fetch_mapbox_route(
    start_lng: float, start_lat: float, end_lng: float, end_lat: float,
    waypoints: Optional[str], client: httpx.AsyncClient
) -> Optional[dict]:
    """Fetch route from Mapbox driving-traffic API. Returns our format or None on error."""
    coords = f"{start_lng},{start_lat}"
    if waypoints:
        for wp in waypoints.split("|"):
            parts = wp.strip().split(",")
            if len(parts) >= 2:
                coords += f";{float(parts[1])},{float(parts[0])}"
    coords += f";{end_lng},{end_lat}"
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{coords}"
    params = {
        "access_token": settings.MAPBOX_ACCESS_TOKEN,
        "geometries": "geojson",
        "overview": "full",
        "steps": "true",
        "annotations": "congestion,duration,distance",
    }
    try:
        resp = await client.get(url, params=params, timeout=15.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        routes = data.get("routes") or []
        if not routes:
            return None
        route = routes[0]
        fc, dist, dur = _mapbox_to_feature_collection(route)
        steps = []
        for leg in route.get("legs", []):
            for step in leg.get("steps", []):
                steps.append({
                    "instruction": step.get("maneuver", {}).get("type", ""),
                    "distance": step.get("distance", 0),
                    "duration": step.get("duration", 0),
                })
        return {
            "distance_meters": int(route.get("distance", dist)),
            "duration_seconds": int(route.get("duration", dur)),
            "duration_original": int(route.get("duration", dur)),
            "geometry": fc,
            "steps": steps,
        }
    except Exception:
        return None


@router.get("/route")
async def get_route(
    start_lat: float = Query(...),
    start_lng: float = Query(...),
    end_lat: float = Query(...),
    end_lng: float = Query(...),
    waypoints: Optional[str] = Query(None, description="lat,lng|lat,lng"),
    profile: str = Query(default="driving"),
):
    """Get a route. Uses Mapbox real traffic when MAPBOX_ACCESS_TOKEN is set (driving only). Else OSRM + simulation."""
    # Try Mapbox real traffic for driving (free tier: 100k req/mo)
    if profile == "driving" and settings.MAPBOX_ACCESS_TOKEN:
        async with httpx.AsyncClient() as client:
            result = await _fetch_mapbox_route(start_lng, start_lat, end_lng, end_lat, waypoints, client)
            if result:
                return result

    # Fallback: OSRM + simulated traffic
    coords = f"{start_lng},{start_lat}"
    if waypoints:
        for wp in waypoints.split("|"):
            wlat, wlng = wp.split(",")
            coords += f";{wlng},{wlat}"
    coords += f";{end_lng},{end_lat}"
    
    url = f"{OSRM_BASE}/route/v1/{profile}/{coords}"
    params = {
        "steps": "true",
        "geometries": "geojson",
        "overview": "full",
        "annotations": "false",
        "alternatives": "true", # Fetch multiple routes for A* heuristic comparison
    }
    
    # Foot/walking routes: no traffic simulation (stays in parks/pedestrian paths)
    is_walking = profile in ("foot", "walking")

    # Get current hour in IST for realism (0-23)
    ist = pytz.timezone('Asia/Kolkata')
    current_hour = datetime.now(ist).hour

    # Traffic multiplier based on time of day (driving only)
    # Night (22:00 - 06:00): Low base but still visible variety so colors show
    # Rush Hour (08:00-11:00, 17:00-20:00): High traffic
    # Daytime (11:00-17:00, 20:00-22:00): Moderate traffic
    is_night = current_hour >= 22 or current_hour <= 6
    is_rush_hour = (8 <= current_hour <= 11) or (17 <= current_hour <= 20)

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(url, params=params)
            data = resp.json()
            if data.get("code") != "Ok":
                return {"error": "No route found", "code": data.get("code")}
            
            routes = data.get("routes", [])
            best_route = None
            best_simulated_duration = float("inf")
            best_feature_collection = None
            best_steps_meta = []
            
            # A* Heuristic: Evaluate traffic across all alternatives
            for route in routes:
                feature_collection = {"type": "FeatureCollection", "features": []}
                total_simulated_duration = 0
                steps_meta = []
                
                raw_geometry = route.get("geometry", {}).get("coordinates", [])
                coord_index = 0
                
                for leg in route.get("legs", []):
                    for step in leg.get("steps", []):
                        dist = step["distance"]
                        dur = step["duration"]
                        
                        # OSRM maps step coordinates sequentially from the master geometry list
                        # The number of coords in this step is given by the length of the step's polyline
                        # Since we asked for geojson, step["geometry"]["coordinates"] exists.
                        if not step.get("geometry") or not step["geometry"].get("coordinates"):
                            continue
                            
                        step_coords = step["geometry"]["coordinates"]
                        if not step_coords:
                            continue
                            
                        # Foot/walking: no traffic, all segments low (parks/pedestrian paths)
                        if is_walking:
                            congestion = "low"
                            multiplier = 1.0
                        else:
                            # Generate deterministic "Traffic Hash" based on step coordinates
                            start_coord = step_coords[0]
                            coord_str = f"{start_coord[0]:.4f},{start_coord[1]:.4f}"
                            hash_val = int(hashlib.md5(coord_str.encode()).hexdigest(), 16) % 100

                            # Traffic level: time of day + hash variance. Ensure visible variety
                            # even at night so the color coding is noticeable.
                            congestion = "low"
                            multiplier = 1.0

                            if is_night:
                                # Night: still show mix so traffic colors are visible (~25% moderate, ~10% heavy)
                                if hash_val > 88 and dist > 300:
                                    congestion = "heavy"
                                    multiplier = 2.0
                                elif hash_val > 65:
                                    congestion = "moderate"
                                    multiplier = 1.35
                            elif is_rush_hour:
                                # Rush hour: heavy traffic dominant
                                if hash_val < 45:
                                    congestion = "heavy"
                                    multiplier = 2.5
                                elif hash_val < 78:
                                    congestion = "moderate"
                                    multiplier = 1.5
                            else:
                                # Daytime
                                if hash_val < 20:
                                    congestion = "heavy"
                                    multiplier = 2.2
                                elif hash_val < 55:
                                    congestion = "moderate"
                                    multiplier = 1.45
                        
                        # Calculate heuristic adjusted duration
                        adjusted_dur = dur * multiplier
                        total_simulated_duration += adjusted_dur
                        
                        # Build GeoJSON feature for this segment
                        feature = {
                            "type": "Feature",
                            "properties": {
                                "congestion": congestion,
                                "duration_original": dur,
                                "duration_simulated": adjusted_dur,
                                "distance": dist
                            },
                            "geometry": {
                                "type": "LineString",
                                "coordinates": step_coords
                            }
                        }
                        feature_collection["features"].append(feature)
                        
                        # Metadata for directions
                        steps_meta.append({
                            "instruction": step.get("maneuver", {}).get("type", ""),
                            "distance": dist,
                            "duration": adjusted_dur,
                        })

                # Compare heuristics
                if total_simulated_duration < best_simulated_duration:
                    best_simulated_duration = total_simulated_duration
                    best_route = route
                    best_feature_collection = feature_collection
                    best_steps_meta = steps_meta
                    
            if not best_route:
                return {"error": "Failed to parse simulated traffic routes."}

            return {
                "distance_meters": best_route["distance"],
                "duration_seconds": math.ceil(best_simulated_duration), # Simulated duration
                "duration_original": best_route["duration"],
                "geometry": best_feature_collection, # Overridden collection
                "steps": best_steps_meta,
            }
            
        except httpx.TimeoutException:
            return {"error": "Routing service timeout. Please try again."}
        except Exception as e:
            return {"error": str(e)}

@router.get("/aqi")
async def get_aqi(lat: float = Query(...), lng: float = Query(...)):
    """Get AQI for a location from OpenAQ."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                "https://api.openaq.org/v2/latest",
                params={
                    "coordinates": f"{lat},{lng}",
                    "radius": 25000,
                    "limit": 5,
                    "parameter": "pm25",
                },
                headers={"X-API-Key": "demo"},
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                if results:
                    measurements = results[0].get("measurements", [])
                    if measurements:
                        pm25 = measurements[0].get("value", 0)
                        aqi = min(500, int(pm25 * 4.0))
                        return {"aqi": aqi, "pm25": pm25, "status": _aqi_status(aqi)}
            return {"aqi": 145, "pm25": 36, "status": "Unhealthy for Sensitive Groups"}
        except Exception:
            return {"aqi": 145, "pm25": 36, "status": "Unhealthy for Sensitive Groups"}


def _aqi_status(aqi: int) -> str:
    if aqi <= 50:
        return "Good"
    elif aqi <= 100:
        return "Moderate"
    elif aqi <= 150:
        return "Unhealthy for Sensitive Groups"
    elif aqi <= 200:
        return "Unhealthy"
    elif aqi <= 300:
        return "Very Unhealthy"
    return "Hazardous"
