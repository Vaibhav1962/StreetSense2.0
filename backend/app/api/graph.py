import httpx
import asyncio
import math
import json
import logging
import sys
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel, Field, Session, select
from app.core.database import engine, get_session

router = APIRouter()
logger = logging.getLogger(__name__)

# Increase recursion limit for deep road networks
sys.setrecursionlimit(10000)

# --- Models ---

class GraphCache(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str  # JSON text
    computed_at: datetime = Field(default_factory=datetime.utcnow)

# --- Utilities ---

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# --- Graph Processing ---

async def fetch_road_network():
    """Fetch road network for Delhi NCR from Overpass API."""
    # Narrowed bbox to focus on the city and improve performance
    bbox = "28.5,77.0,28.8,77.4"
    query = f"""
    [out:json][timeout:60];
    (
      way["highway"~"trunk|primary|secondary"]({bbox});
    );
    out body;
    >;
    out skel qt;
    """
    url = "https://overpass-api.de/api/interpreter"
    
    async with httpx.AsyncClient(timeout=90.0) as client:
        try:
            response = await client.post(url, data={"data": query})
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching from Overpass: {e}")
            raise HTTPException(status_code=503, detail="Overpass API error or timeout. Please try again later.")

def parse_graph(data):
    nodes_info = {}
    edges = []
    
    for element in data.get('elements', []):
        if element.get('type') == 'node':
            nodes_info[element['id']] = (element['lat'], element['lon'])
        elif element.get('type') == 'way':
            way_nodes = element.get('nodes', [])
            for i in range(len(way_nodes) - 1):
                u, v = way_nodes[i], way_nodes[i+1]
                edges.append((u, v))
                
    # Build adjacency list with integer mapping for speed
    osm_to_idx = {node_id: i for i, node_id in enumerate(nodes_info.keys())}
    idx_to_osm = {i: node_id for node_id, i in osm_to_idx.items()}
    num_nodes = len(osm_to_idx)
    
    adj = [[] for _ in range(num_nodes)]
    for u_osm, v_osm in edges:
        if u_osm not in osm_to_idx or v_osm not in osm_to_idx: continue
        u, v = osm_to_idx[u_osm], osm_to_idx[v_osm]
        
        dist = haversine(nodes_info[u_osm][0], nodes_info[u_osm][1], nodes_info[v_osm][0], nodes_info[v_osm][1])
        adj[u].append((v, dist))
        adj[v].append((u, dist))
        
    return adj, nodes_info, osm_to_idx, idx_to_osm

def run_brandes(adj):
    num_nodes = len(adj)
    CB = [0.0] * num_nodes
    
    for s in range(num_nodes):
        S = []
        P = [[] for _ in range(num_nodes)]
        sigma = [0] * num_nodes
        sigma[s] = 1
        d = [-1] * num_nodes
        d[s] = 0
        
        Q = [s]
        head = 0
        while head < len(Q):
            v = Q[head]
            head += 1
            S.append(v)
            for w, _ in adj[v]:
                if d[w] < 0:
                    d[w] = d[v] + 1
                    Q.append(w)
                if d[w] == d[v] + 1:
                    sigma[w] += sigma[v]
                    P[w].append(v)
        
        delta = [0.0] * num_nodes
        while S:
            w = S.pop()
            for v in P[w]:
                delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w])
            if w != s:
                CB[w] += delta[w]
    return CB

def run_tarjan(adj, scores, nodes_info, idx_to_osm):
    num_nodes = len(adj)
    bridges = []
    ids = [-1] * num_nodes
    low = [-1] * num_nodes
    timer = 0
    
    def dfs(u, p=-1):
        nonlocal timer
        ids[u] = low[u] = timer
        timer += 1
        
        for v, _ in adj[u]:
            if v == p: continue
            if ids[v] == -1:
                dfs(v, u)
                low[u] = min(low[u], low[v])
                if low[v] > ids[u]:
                    u_osm, v_osm = idx_to_osm[u], idx_to_osm[v]
                    importance = scores[u] + scores[v]
                    bridges.append({
                        "start_lat": nodes_info[u_osm][0], "start_lng": nodes_info[u_osm][1],
                        "end_lat": nodes_info[v_osm][0], "end_lng": nodes_info[v_osm][1],
                        "importance_score": importance
                    })
            else:
                low[u] = min(low[u], ids[v])

    for i in range(num_nodes):
        if ids[i] == -1:
            dfs(i)
            
    return sorted(bridges, key=lambda x: x['importance_score'], reverse=True)[:50]

def compute_everything(raw_data):
    """Main computation function to be run in a separate thread."""
    adj, nodes_info, osm_to_idx, idx_to_osm = parse_graph(raw_data)
    
    if not adj or len(adj) == 0:
        return None

    # Run Brandes
    cb_scores = run_brandes(adj)
    
    # Process Choke Points
    max_score = max(cb_scores) if cb_scores else 1
    choke_points = []
    for i, score in enumerate(cb_scores):
        if score == 0: continue
        node_id = idx_to_osm[i]
        choke_points.append({
            "id": str(node_id),
            "lat": nodes_info[node_id][0],
            "lng": nodes_info[node_id][1],
            "score": score / max_score,
            "rank": 0
        })
    choke_points = sorted(choke_points, key=lambda x: x['score'], reverse=True)[:30]
    for i, cp in enumerate(choke_points): cp['rank'] = i + 1
    
    # Run Tarjan
    bridges = run_tarjan(adj, cb_scores, nodes_info, idx_to_osm)
    
    return {
        "choke_points": choke_points,
        "bridges": bridges,
        "computed_at": datetime.utcnow().isoformat()
    }

async def get_or_compute_graph_data(session: Session):
    start_time = datetime.utcnow()
    
    # Check cache
    cache_entry = session.exec(select(GraphCache).where(GraphCache.key == "delhi_graph")).first()
    if cache_entry and cache_entry.computed_at > datetime.utcnow() - timedelta(hours=24):
        try:
            data = json.loads(cache_entry.value)
            return data, True, (datetime.utcnow() - start_time).total_seconds()
        except:
            pass

    # Compute
    logger.info("Building road graph from OpenStreetMap data...")
    raw_data = await fetch_road_network()
    
    # Run heavy computation in a thread to keep the event loop free
    result = await asyncio.to_thread(compute_everything, raw_data)
    
    if result is None:
        raise HTTPException(status_code=500, detail="Could not build a valid graph from OSM data.")
    
    # Cache
    if cache_entry:
        cache_entry.value = json.dumps(result)
        cache_entry.computed_at = datetime.utcnow()
    else:
        cache_entry = GraphCache(key="delhi_graph", value=json.dumps(result))
    
    session.add(cache_entry)
    session.commit()
    
    return result, False, (datetime.utcnow() - start_time).total_seconds()

@router.get("/choke-points")
async def get_choke_points(session: Session = Depends(get_session)):
    data, from_cache, duration = await get_or_compute_graph_data(session)
    return {
        "choke_points": data["choke_points"],
        "computed_at": data["computed_at"],
        "from_cache": from_cache,
        "computation_time_seconds": duration
    }

@router.get("/bridges")
async def get_bridges(session: Session = Depends(get_session)):
    data, from_cache, duration = await get_or_compute_graph_data(session)
    return {
        "bridges": data["bridges"],
        "computed_at": data["computed_at"],
        "from_cache": from_cache,
        "computation_time_seconds": duration
    }

@router.post("/recompute")
async def recompute_graph(session: Session = Depends(get_session)):
    # Simply delete cache and trigger a fresh compute via the data function
    session.exec("DELETE FROM graphcache WHERE key = 'delhi_graph'")
    session.commit()
    return await get_choke_points(session)
