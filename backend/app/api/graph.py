import httpx
import asyncio
import math
import json
import logging
import sys
import heapq
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel, Field, Session, select
from app.core.database import engine, get_session

router = APIRouter()
logger = logging.getLogger(__name__)

# Increase recursion limit
sys.setrecursionlimit(10000)

# --- Models ---

class GraphCache(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str  # JSON text
    computed_at: datetime = Field(default_factory=datetime.utcnow)

# --- Utilities ---

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000  # meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# --- Graph Processing ---

async def fetch_road_network():
    """Fetch road network for Delhi NCR from Overpass API."""
    # Central Delhi bbox
    bbox = "28.58,77.10,28.72,77.30"
    query = f"""
    [out:json][timeout:30];
    (
      way["highway"~"trunk|primary|secondary"]({bbox});
    );
    out body;
    >;
    out skel qt;
    """
    url = "https://overpass-api.de/api/interpreter"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(url, data={"data": query})
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching from Overpass: {e}")
            raise HTTPException(status_code=503, detail="Overpass API error. Please try again later.")

def parse_graph(data):
    nodes_info = {}
    edges = []
    
    elements = data.get('elements', [])
    if not elements: return None, None, None, None

    for element in elements:
        if element.get('type') == 'node':
            nodes_info[element['id']] = (element['lat'], element['lon'])
        elif element.get('type') == 'way':
            way_nodes = element.get('nodes', [])
            for i in range(len(way_nodes) - 1):
                u, v = way_nodes[i], way_nodes[i+1]
                edges.append((u, v))
                
    if not nodes_info: return None, None, None, None

    osm_to_idx = {node_id: i for i, node_id in enumerate(nodes_info.keys())}
    idx_to_osm = {i: node_id for node_id, i in osm_to_idx.items()}
    num_nodes = len(osm_to_idx)
    
    adj = [[] for _ in range(num_nodes)]
    degrees = [0] * num_nodes
    for u_osm, v_osm in edges:
        if u_osm not in osm_to_idx or v_osm not in osm_to_idx: continue
        u, v = osm_to_idx[u_osm], osm_to_idx[v_osm]
        
        dist = haversine(nodes_info[u_osm][0], nodes_info[u_osm][1], nodes_info[v_osm][0], nodes_info[v_osm][1])
        adj[u].append((v, dist))
        adj[v].append((u, dist))
        degrees[u] += 1
        degrees[v] += 1
        
    return adj, nodes_info, osm_to_idx, idx_to_osm, degrees

def run_brandes_weighted(adj):
    """Brandes' algorithm using Dijkstra for weighted shortest paths."""
    num_nodes = len(adj)
    # CPU Safety Limit for Render
    limit = min(num_nodes, 1200)
    CB = [0.0] * num_nodes
    
    for s in range(limit):
        S = []
        P = [[] for _ in range(num_nodes)]
        sigma = [0] * num_nodes
        sigma[s] = 1
        d = [float('inf')] * num_nodes
        d[s] = 0
        
        pq = [(0, s)]
        while pq:
            dist, v = heapq.heappop(pq)
            if dist > d[v]: continue
            S.append(v)
            for w, weight in adj[v]:
                new_dist = d[v] + weight
                if d[w] > new_dist:
                    d[w] = new_dist
                    heapq.heappush(pq, (new_dist, w))
                    sigma[w] = sigma[v]
                    P[w] = [v]
                elif d[w] == new_dist:
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

def run_tarjan_iterative(adj, scores, nodes_info, idx_to_osm):
    num_nodes = len(adj)
    if not adj: return []
    bridges = []
    ids = [-1] * num_nodes
    low = [-1] * num_nodes
    timer = 0
    
    for start_node in range(num_nodes):
        if ids[start_node] == -1:
            stack = [(start_node, -1, iter(adj[start_node]))]
            ids[start_node] = low[start_node] = timer
            timer += 1
            while stack:
                u, p, neighbors = stack[-1]
                try:
                    v, _ = next(neighbors)
                    if v == p: continue
                    if ids[v] == -1:
                        ids[v] = low[v] = timer
                        timer += 1
                        stack.append((v, u, iter(adj[v])))
                    else:
                        low[u] = min(low[u], ids[v])
                except StopIteration:
                    stack.pop()
                    if stack:
                        p_node, _, _ = stack[-1]
                        low[p_node] = min(low[p_node], low[u])
                        if low[u] > ids[p_node]:
                            u_osm, p_osm = idx_to_osm[u], idx_to_osm[p_node]
                            importance = (scores[u] if u < len(scores) else 0) + (scores[p_node] if p_node < len(scores) else 0)
                            bridges.append({
                                "start_lat": nodes_info[u_osm][0], "start_lng": nodes_info[u_osm][1],
                                "end_lat": nodes_info[p_osm][0], "end_lng": nodes_info[p_osm][1],
                                "importance_score": importance
                            })
    return sorted(bridges, key=lambda x: x['importance_score'], reverse=True)[:50]

def compute_everything(raw_data):
    try:
        adj, nodes_info, osm_to_idx, idx_to_osm, degrees = parse_graph(raw_data)
        if not adj: return None

        # Run Weighted Brandes
        logger.info(f"Running Weighted Brandes on {len(adj)} nodes...")
        cb_scores = run_brandes_weighted(adj)
        
        # Process Choke Points - Filter for Intersections (degree > 2)
        max_score = max(cb_scores) if cb_scores else 1
        candidates = []
        for i, score in enumerate(cb_scores):
            if score == 0: continue
            # Primary Intersection Filter: Degree > 2 or high score
            if degrees[i] <= 2 and score < (max_score * 0.5): continue
            
            node_id = idx_to_osm[i]
            candidates.append({
                "id": str(node_id),
                "lat": nodes_info[node_id][0],
                "lng": nodes_info[node_id][1],
                "score": score / max_score
            })
        
        # Spatial Deduplication - don't show markers too close to each other
        candidates = sorted(candidates, key=lambda x: x['score'], reverse=True)
        choke_points = []
        for cand in candidates:
            too_close = False
            for existing in choke_points:
                dist = haversine(cand['lat'], cand['lng'], existing['lat'], existing['lng'])
                if dist < 400: # 400m radius
                    too_close = True
                    break
            if not too_close:
                cand['rank'] = len(choke_points) + 1
                choke_points.append(cand)
            if len(choke_points) >= 30: break

        # Run Tarjan
        logger.info("Running Tarjan's bridge discovery...")
        bridges = run_tarjan_iterative(adj, cb_scores, nodes_info, idx_to_osm)
        
        return {
            "choke_points": choke_points,
            "bridges": bridges,
            "computed_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in compute_everything: {e}")
        return None

async def get_or_compute_graph_data(session: Session):
    start_time = datetime.utcnow()
    try:
        cache_entry = session.exec(select(GraphCache).where(GraphCache.key == "delhi_graph")).first()
        if cache_entry and cache_entry.computed_at > datetime.utcnow() - timedelta(hours=24):
            return json.loads(cache_entry.value), True, (datetime.utcnow() - start_time).total_seconds()
    except: cache_entry = None

    raw_data = await fetch_road_network()
    result = await asyncio.to_thread(compute_everything, raw_data)
    if result is None: raise HTTPException(status_code=500, detail="Graph analysis failed.")
    
    try:
        if cache_entry:
            cache_entry.value = json.dumps(result)
            cache_entry.computed_at = datetime.utcnow()
        else:
            cache_entry = GraphCache(key="delhi_graph", value=json.dumps(result))
        session.add(cache_entry)
        session.commit()
    except: pass
    
    return result, False, (datetime.utcnow() - start_time).total_seconds()

@router.get("/choke-points")
async def get_choke_points(session: Session = Depends(get_session)):
    data, from_cache, duration = await get_or_compute_graph_data(session)
    return {"choke_points": data["choke_points"], "computed_at": data["computed_at"], "from_cache": from_cache, "computation_time_seconds": duration}

@router.get("/bridges")
async def get_bridges(session: Session = Depends(get_session)):
    data, from_cache, duration = await get_or_compute_graph_data(session)
    return {"bridges": data["bridges"], "computed_at": data["computed_at"], "from_cache": from_cache, "computation_time_seconds": duration}

@router.post("/recompute")
async def recompute_graph(session: Session = Depends(get_session)):
    session.execute(select(GraphCache).where(GraphCache.key == "delhi_graph")) # touch
    session.exec("DELETE FROM graphcache WHERE key = 'delhi_graph'")
    session.commit()
    return await get_choke_points(session)
