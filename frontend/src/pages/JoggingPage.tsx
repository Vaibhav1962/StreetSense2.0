import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, MapPin, Loader2, RefreshCw, Clock, Route, Wind } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { LANDMARKS } from '../lib/landmarks';
import { formatDistance, getAqiDisplay } from '../lib/utils';
import { getAqi } from '../lib/api';

const DEFAULT_PARKS = LANDMARKS.filter(l => l.category === 'park');

interface JoggingRoute {
  id: string;
  name: string;
  distance: number; // Approximate target distance in meters
  difficulty: 'Easy' | 'Moderate' | 'Hard';
  description: string;
  park: typeof DEFAULT_PARKS[0] & { boundingbox?: string[] };
}

function generateRoutes(park: any): JoggingRoute[] {
  // Rather than random distances, use fixed target distances for consistent categorization
  return [
    {
      id: `${park.id}-easy`,
      name: `${park.name} — Easy Loop`,
      distance: 1500, // ~1.5km
      difficulty: 'Easy',
      description: 'A gentle loop exploring part of the park. Perfect for beginners or a warm-up run.',
      park,
    },
    {
      id: `${park.id}-mod`,
      name: `${park.name} — Trail Mix`,
      distance: 3000, // ~3km
      difficulty: 'Moderate',
      description: 'A balanced route covering most of the park paths with standard elevation changes.',
      park,
    },
    {
      id: `${park.id}-hard`,
      name: `${park.name} — Endurance Run`,
      distance: 5500, // ~5.5km
      difficulty: 'Hard',
      description: 'Full perimeter sweep with complex inner track segments for maximum endurance building.',
      park,
    },
  ];
}

const DIFFICULTY_COLORS = {
  Easy: { bg: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
  Moderate: { bg: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.05))', border: 'rgba(245,158,11,0.3)', text: '#fbbf24' },
  Hard: { bg: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05))', border: 'rgba(239,68,68,0.3)', text: '#f87171' },
};

export default function JoggingPage() {
  const navigate = useNavigate();
  const [parks, setParks] = useState(DEFAULT_PARKS);
  const [selectedPark, setSelectedPark] = useState(DEFAULT_PARKS[0]);
  const [routes, setRoutes] = useState<JoggingRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JoggingRoute | null>(null);
  const [aqi, setAqi] = useState<ReturnType<typeof getAqiDisplay> | null>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const offset = 0.15;
          const res = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
              q: '[leisure=park]', format: 'json',
              viewbox: `${lng - offset},${lat + offset},${lng + offset},${lat - offset}`, bounded: 1, limit: 12
            }
          });
          if (res.data && res.data.length > 0) {
            const dynamicParks = res.data.map((item: any) => ({
              id: item.place_id.toString(), name: item.name || item.display_name.split(',')[0],
              address: item.display_name, category: 'park',
              lat: parseFloat(item.lat), lng: parseFloat(item.lon),
              boundingbox: item.boundingbox // [southLat, northLat, westLon, eastLon]
            }));
            const unique = Array.from(new Map(dynamicParks.map((p: any) => [p.name, p])).values()) as any[];
            setParks(unique.length ? unique : DEFAULT_PARKS);
            setSelectedPark(unique.length ? unique[0] : DEFAULT_PARKS[0]);
          }
        } catch { /* keep defaults */ }
        setLoading(false);
      },
      () => setLoading(false),
      { timeout: 8000 }
    );
  }, []);

  function loadRoutes(park: typeof DEFAULT_PARKS[0]) {
    if (!park) return;
    setLoading(true);
    setLoading(true);
    setSelected(null);
    setAqi(null);
    getAqi(park.lat, park.lng)
      .then(res => setAqi(getAqiDisplay(res.aqi)))
      .catch(() => setAqi(null));
      
    setTimeout(() => {
      setRoutes(generateRoutes(park));
      setLoading(false);
    }, 800);
  }

  useEffect(() => {
    if (parks.length > 0) loadRoutes(selectedPark);
  }, [selectedPark, parks]);

  return (
    <div className="h-full flex flex-col p-6 overflow-auto"
      style={{ background: 'linear-gradient(135deg, #070a12 0%, #0f1520 100%)' }}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Jogging Routes</h1>
            <p className="text-white/40 text-sm">Curated running trails in Delhi NCR parks</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Park Selector */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
          className="glass-panel rounded-2xl p-4">
          <h2 className="text-white font-semibold mb-3 text-sm uppercase tracking-wider opacity-60">Select Park</h2>
          <div className="space-y-3 pb-24 lg:pb-0 overflow-y-auto min-h-[max-content]">
          {parks.map((park) => (
            <motion.div key={park.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedPark(park)}
              className="glass-panel rounded-2xl p-4 flex items-center gap-4 cursor-pointer relative overflow-hidden transition-all duration-300"
              style={selectedPark.id === park.id ? {
                background: 'rgba(102,126,234,0.15)',
                border: '1px solid rgba(102,126,234,0.4)',
              } : {}}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)' }}>
                <MapPin size={24} className={selectedPark.id === park.id ? 'text-purple-400' : 'text-white/40'} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold truncate">{park.name}</h3>
                <p className="text-white/40 text-xs truncate mt-0.5">{park.address}</p>
              </div>
            </motion.div>
          ))}
        </div>
        </motion.div>

        {/* Routes */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-bold text-lg">{selectedPark.name}</h2>
              {aqi && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Wind size={13} className="text-white/40" />
                  <span className="text-xs font-semibold" style={{ color: aqi.color }}>
                    AQI {aqi.label}
                  </span>
                </div>
              )}
            </div>
            <button onClick={() => loadRoutes(selectedPark)}
              className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm px-3 py-1.5 rounded-lg hover:bg-white/5">
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="animate-spin text-purple-400" size={32} />
            </div>
          ) : (
            <div className="space-y-4">
              {routes.map((route, i) => {
                const colors = DIFFICULTY_COLORS[route.difficulty];
                const isSelected = selected?.id === route.id;
                return (
                  <motion.div key={route.id}
                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    onClick={() => setSelected(isSelected ? null : route)}
                    className="glass-panel rounded-2xl p-5 cursor-pointer transition-all duration-200"
                    style={isSelected ? {
                      background: 'rgba(102,126,234,0.1)',
                      border: '1px solid rgba(102,126,234,0.3)',
                    } : {}}>

                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                            style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}>
                            {route.difficulty}
                          </span>
                        </div>
                        <h3 className="text-white font-bold">{route.name}</h3>
                      </div>
                      <Activity size={18} className="text-purple-400 flex-shrink-0 mt-1" />
                    </div>

                    <p className="text-white/50 text-sm mb-4">{route.description}</p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.2)' }}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Route size={12} className="text-purple-400" />
                          <span className="text-white/40 text-xs">Distance</span>
                        </div>
                        <p className="text-white font-bold">{formatDistance(route.distance)}</p>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.2)' }}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Clock size={12} className="text-blue-400" />
                          <span className="text-white/40 text-xs">Est. Pace Time</span>
                        </div>
                        <p className="text-white font-bold">{Math.round((route.distance / 1000) * 6)} min</p>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isSelected && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }} className="mt-4 pt-4 border-t border-white/10">
                          <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
                            <MapPin size={12} />
                            <span>{route.park.address}</span>
                          </div>
                          <button
                            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
                            onClick={(e) => { 
                              e.stopPropagation();
                              // Ifbounding box available, generate points inside the park bounds to ensure walking route stays on internal paths.
                              // fallback to small tight radius otherwise
                              let waypoints = '';
                              if (route.park.boundingbox) {
                                const [sLat, nLat, wLng, eLng] = route.park.boundingbox.map(Number);
                                const centerLat = (sLat + nLat) / 2;
                                const centerLng = (wLng + eLng) / 2;
                                
                                // Offset inwards by 15% to strictly stay off boundary roads
                                const padLat = (nLat - sLat) * 0.15;
                                const padLng = (eLng - wLng) * 0.15;
                                
                                const maxLatR = (nLat - sLat) / 2 - padLat;
                                const maxLngR = (eLng - wLng) / 2 - padLng;
                                
                                const points = [];
                                
                                if (route.difficulty === 'Easy') {
                                  // Simple small inner circle
                                  const steps = 6;
                                  for (let i = 0; i < steps; i++) {
                                    const angle = (i / steps) * Math.PI * 2;
                                    points.push([centerLat + Math.cos(angle) * maxLatR * 0.5, centerLng + Math.sin(angle) * maxLngR * 0.5]);
                                  }
                                } else if (route.difficulty === 'Moderate') {
                                  // Full outer perimeter loop
                                  const steps = 8;
                                  for (let i = 0; i < steps; i++) {
                                    const angle = (i / steps) * Math.PI * 2;
                                    points.push([centerLat + Math.cos(angle) * maxLatR, centerLng + Math.sin(angle) * maxLngR]);
                                  }
                                } else {
                                  // Hard: star/zigzag pattern inside bounding box to maximize distance
                                  const steps = 10;
                                  for (let i = 0; i < steps; i++) {
                                    const angle1 = (i / steps) * Math.PI * 2;
                                    const angle2 = ((i + 0.5) / steps) * Math.PI * 2;
                                    points.push([centerLat + Math.cos(angle1) * maxLatR, centerLng + Math.sin(angle1) * maxLngR]);
                                    points.push([centerLat + Math.cos(angle2) * maxLatR * 0.3, centerLng + Math.sin(angle2) * maxLngR * 0.3]);
                                  }
                                }
                                waypoints = points.map(p => `${p[0]},${p[1]}`).join('|');
                              } else {
                                const dkm = route.distance / 1000;
                                const r = Math.min((dkm / 4) / 111.32, 0.0008); 
                                const wpLat1 = route.park.lat + r, wpLng1 = route.park.lng;
                                const wpLat2 = route.park.lat, wpLng2 = route.park.lng + r;
                                const wpLat3 = route.park.lat - r, wpLng3 = route.park.lng;
                                waypoints = `${wpLat1},${wpLng1}|${wpLat2},${wpLng2}|${wpLat3},${wpLng3}`;
                              }
                              
                              navigate(`/map?startLat=${route.park.lat}&startLng=${route.park.lng}&startName=Start+Run&endLat=${route.park.lat}&endLng=${route.park.lng}&endName=End+Run&waypoints=${encodeURIComponent(waypoints)}&profile=foot&hideEta=1`);
                            }}>
                            Open loop in Map →
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
