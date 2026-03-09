import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion, AnimatePresence } from 'framer-motion';
import { GitFork, Activity, ShieldAlert, Clock, RefreshCw, ChevronRight, Info } from 'lucide-react';
import api from '../lib/api';
import { toast } from 'sonner';

interface ChokePoint {
  id: string;
  lat: number;
  lng: number;
  score: number;
  rank: number;
}

interface Bridge {
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  importance_score: number;
}

const GraphPage: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [activeTab, setActiveTab] = useState<'choke-points' | 'bridges'>('choke-points');
  const [loading, setLoading] = useState(true);
  const [chokePoints, setChokePoints] = useState<ChokePoint[]>([]);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [compTime, setCompTime] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const markers = useRef<maplibregl.Marker[]>([]);

  const fetchGraphData = async (force = false) => {
    setLoading(true);
    try {
      const endpoint = force ? '/graph/recompute' : '/graph/choke-points';
      const method = force ? 'post' : 'get';
      
      const res = await api[method](endpoint);
      const bridgeRes = await api.get('/graph/bridges');
      
      setChokePoints(res.data.choke_points || []);
      setBridges(bridgeRes.data.bridges || []);
      setComputedAt(res.data.computed_at);
      setCompTime(res.data.computation_time_seconds);
      setFromCache(res.data.from_cache);
      
      toast.success(force ? 'Graph recomputed' : 'Graph analysis loaded');
    } catch (err) {
      console.error(err);
      toast.error('Failed to load graph analysis');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraphData();
  }, []);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [77.15, 28.54],
      zoom: 11,
    });

    map.current.on('load', () => {
      if (!map.current) return;
      
      // Add Bridge Source & Layer
      map.current.addSource('bridges', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'bridges-glow',
        type: 'line',
        source: 'bridges',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#f97316', 'line-width': 8, 'line-opacity': 0.3 }
      });

      map.current.addLayer({
        id: 'bridges-main',
        type: 'line',
        source: 'bridges',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#f97316', 'line-width': 4 }
      });
    });

    return () => map.current?.remove();
  }, []);

  useEffect(() => {
    if (!map.current) return;

    // Update Bridges Layer
    const bridgeFeatures = bridges.map(b => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[b.start_lng, b.start_lat], [b.end_lng, b.end_lat]]
      },
      properties: { importance: b.importance_score }
    }));

    const source = map.current.getSource('bridges') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({ type: 'FeatureCollection', features: bridgeFeatures as any });
      map.current.setLayoutProperty('bridges-glow', 'visibility', activeTab === 'bridges' ? 'visible' : 'none');
      map.current.setLayoutProperty('bridges-main', 'visibility', activeTab === 'bridges' ? 'visible' : 'none');
    }

    // Update Markers
    markers.current.forEach(m => m.remove());
    markers.current = [];

    if (activeTab === 'choke-points') {
      chokePoints.forEach(cp => {
        const size = 16 + (cp.score * 32);
        const el = document.createElement('div');
        el.className = 'choke-point-marker';
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.backgroundColor = '#ef4444';
        el.style.borderRadius = '50%';
        el.style.boxShadow = '0 0 15px #ef4444, 0 0 5px #ef4444 inset';
        el.style.cursor = 'pointer';
        el.style.border = '2px solid white';

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([cp.lng, cp.lat])
          .setPopup(new maplibregl.Popup().setHTML(`
            <div style="color: black; padding: 5px;">
              <strong>Rank #${cp.rank}</strong><br/>
              Centrality: ${(cp.score * 100).toFixed(1)}%<br/>
              <small>${cp.lat.toFixed(4)}, ${cp.lng.toFixed(4)}</small>
            </div>
          `))
          .addTo(map.current!);
        
        markers.current.push(marker);
      });
    }
  }, [chokePoints, bridges, activeTab]);

  const flyTo = (lat: number, lng: number) => {
    map.current?.flyTo({ center: [lng, lat], zoom: 15, duration: 2000 });
  };

  return (
    <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden bg-[#070a12]">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Sidebar */}
      <motion.div 
        initial={{ opacity: 0, x: -320 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute left-6 top-6 bottom-6 w-80 glass-panel overflow-hidden flex flex-col z-10"
      >
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/20 rounded-lg text-primary">
              <GitFork size={24} />
            </div>
            <h1 className="text-xl font-bold text-white leading-tight">Graph Analysis</h1>
          </div>
          <p className="text-white/40 text-xs">Delhi NCR Road Network Topology</p>
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-white/5 mx-6 mt-4 rounded-xl border border-white/10">
          <button 
            onClick={() => setActiveTab('choke-points')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm transition-all ${activeTab === 'choke-points' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-white/40 hover:text-white'}`}
          >
            <ShieldAlert size={16} />
            Choke Points
          </button>
          <button 
            onClick={() => setActiveTab('bridges')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm transition-all ${activeTab === 'bridges' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-white/40 hover:text-white'}`}
          >
            <Activity size={16} />
            Bridges
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'choke-points' ? (
              <motion.div 
                key="choke"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {chokePoints.map((cp) => (
                  <div 
                    key={cp.id}
                    onClick={() => flyTo(cp.lat, cp.lng)}
                    className="p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-red-400">RANK #{cp.rank}</span>
                      <span className="text-xs text-white/40">{cp.lat.toFixed(3)}, {cp.lng.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-red-500" 
                          style={{ width: `${cp.score * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-white">{(cp.score * 100).toFixed(0)}%</span>
                      <ChevronRight size={14} className="text-white/20 group-hover:text-white transition-colors" />
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div 
                key="bridge"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {bridges.map((b, i) => (
                  <div 
                    key={i}
                    onClick={() => flyTo(b.start_lat, b.start_lng)}
                    className="p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-orange-400">BRIDGE #{i+1}</span>
                      <span className="text-xs text-white/40">Imp Score: {b.importance_score.toFixed(1)}</span>
                    </div>
                    <div className="text-[10px] text-white/60 font-mono">
                      {b.start_lat.toFixed(4)}, {b.start_lng.toFixed(4)} → {b.end_lat.toFixed(4)}, {b.end_lng.toFixed(4)}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Info Box */}
        <div className="p-6 bg-white/5 border-t border-white/10 space-y-4">
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex gap-3">
            <Info size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="text-[10px] text-white/60 leading-relaxed">
              <strong>Betweenness Centrality:</strong> measures how often a node lies on the shortest path between all other pairs. <br/><br/>
              <strong>Bridges:</strong> road segments that, if removed, would disconnect parts of the graph.
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Last Sync</span>
              <span className="text-xs text-white/80 flex items-center gap-1">
                <Clock size={12} />
                {computedAt ? new Date(computedAt).toLocaleTimeString() : 'Never'}
              </span>
            </div>
            <button 
              onClick={() => fetchGraphData(true)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors flex items-center gap-2 text-xs"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Recompute
            </button>
          </div>
        </div>
      </motion.div>

      {/* Loading Overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md z-50 flex flex-col items-center justify-center p-10 text-center"
          >
            <div className="relative">
              <GitFork size={64} className="text-primary animate-pulse" />
              <div className="absolute inset-0 blur-2xl bg-primary/20 rounded-full" />
            </div>
            <h2 className="text-2xl font-bold text-white mt-8 mb-2">Building Road Graph</h2>
            <p className="text-white/40 text-sm max-w-md">
              Running Brandes' and Tarjan's algorithms on the Delhi NCR topology. This might take 30-60 seconds...
            </p>
            <div className="mt-8 flex items-center gap-2 text-primary font-mono text-sm">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Processing...
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <style>{`
        .choke-point-marker:hover {
          transform: scale(1.2);
          z-index: 100;
          transition: transform 0.2s ease;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};

export default GraphPage;
