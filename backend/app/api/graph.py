import httpx
import asyncio
import math
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel, Field, Session, select
from app.core.database import engine, get_session

router = APIRouter()
logger = logging.getLogger(__name__)

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
    bbox = "28.4,76.8,28.85,77.6"
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
                
    # Build adjacency list
    adj = {}
    for u, v in edges:
        if u not in nodes_info or v not in nodes_info: continue
        
        dist = haversine(nodes_info[u][0], nodes_info[u][1], nodes_info[v][0], nodes_info[v][1])
        
        if u not in adj: adj[u] = []
        if v not in adj: adj[v] = []
        adj[u].append((v, dist))
        adj[v].append((u, dist))
        
    return adj, nodes_info

# --- Algorithms (From Scratch) ---

def brandes_betweenness(adj, nodes_info):
    """Brandes' algorithm for node betweenness centrality."""
    CB = {v: 0.0 for v in adj}
    
    for s in adj:
        # Step 1: Single-source shortest paths
        S = []  # Stack
        P = {v: [] for v in adj}  # Predecessors
        sigma = {v: 0 for v in adj}
        sigma[s] = 1
        d = {v: -1 for v in adj}
        d[s] = 0
        
        Q = [s]  # Queue (BFS since we can treat it as unweighted for simplicity in road structure, 
                 # or Dijkstra if we want distance-weighted, but standard betweenness often uses edge counts)
        # Using BFS-style for pure connectivity centrality as described in many transport papers
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
        
        # Step 2: Accumulation
        delta = {v: 0 for v in adj}
        while S:
            w = S.pop()
            for v in P[w]:
                delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w])
            if w != s:
                CB[w] += delta[w]
                
    return CB

def tarjan_bridges(adj, nodes_info, scores):
    """Tarjan's algorithm for finding bridges."""
    bridges = []
    ids = {v: -1 for v in adj}
    low = {v: -1 for v in adj}
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
                    # Importance = sum of centrality of endpoints
                    importance = scores.get(u, 0) + scores.get(v, 0)
                    bridges.append({
                        "start_lat": nodes_info[u][0], "start_lng": nodes_info[u][1],
                        "end_lat": nodes_info[v][0], "end_lng": nodes_info[v][1],
                        "importance_score": importance
                    })
            else:
                low[u] = min(low[u], ids[v])

    for node in adj:
        if ids[node] == -1:
            dfs(node)
            
    return sorted(bridges, key=lambda x: x['importance_score'], reverse=True)[:50]

# --- API Implementation ---

async def get_or_compute_graph_data(session: Session):
    start_time = datetime.utcnow()
    
    # Check cache
    cache_entry = session.exec(select(GraphCache).where(GraphCache.key == "delhi_graph")).first()
    if cache_entry and cache_entry.computed_at > datetime.utcnow() - timedelta(hours=24):
        data = json.loads(cache_entry.value)
        return data, True, (datetime.utcnow() - start_time).total_seconds()

    # Compute
    logger.info("Building road graph from OpenStreetMap data...")
    raw_data = await fetch_road_network()
    adj, nodes_info = parse_graph(raw_data)
    
    if not adj:
        raise HTTPException(status_code=500, detail="Could not build a valid graph from OSM data.")

    # Brandes
    cb_scores = brandes_betweenness(adj, nodes_info)
    
    # Normalize and sort choke points
    max_score = max(cb_scores.values()) if cb_scores else 1
    choke_points = []
    for node_id, score in cb_scores.items():
        choke_points.append({
            "id": str(node_id),
            "lat": nodes_info[node_id][0],
            "lng": nodes_info[node_id][1],
            "score": score / max_score,
            "rank": 0
        })
    choke_points = sorted(choke_points, key=lambda x: x['score'], reverse=True)[:30]
    for i, cp in enumerate(choke_points): cp['rank'] = i + 1
    
    # Bridges
    bridges = tarjan_bridges(adj, nodes_info, cb_scores)
    
    result = {
        "choke_points": choke_points,
        "bridges": bridges,
        "computed_at": datetime.utcnow().isoformat()
    }
    
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
