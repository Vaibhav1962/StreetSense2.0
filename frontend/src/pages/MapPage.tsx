import { useState, useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Navigation2, Locate, MousePointer2, Search, X, ChevronDown,
  Route, Wind, Clock, Loader2, MapPin, Layers, Maximize2, Play, Square,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { LANDMARKS } from '../lib/landmarks';
import { getRoute, getAqi, searchPlaces } from '../lib/api';
import { formatDistance, formatDuration, formatCoords, getAqiDisplay, buildRouteProgress, projectOntoRoute } from '../lib/utils';

// ── NCR bounding box — covers Delhi + Noida + Gurugram + Faridabad + Ghaziabad + Greater Noida
const NCR_CENTER: [number, number] = [77.15, 28.54];
const NCR_ZOOM = 10;

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface Location { lat: number; lng: number; name?: string }

/** Vehicle/chevron marker that points up (map bearing handles rotation) */
function createVehicleMarkerEl() {
  const el = document.createElement('div');
  el.style.cssText = `
    width: 60px; height: 60px;
    display: flex; align-items: center; justify-content: center;
    position: relative;
    filter: drop-shadow(0 6px 16px rgba(0, 221, 255, 0.5));
  `;
  
  el.innerHTML = `
    <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" style="transform: translateY(-10px);">
      <!-- Outer glow ring -->
      <circle cx="30" cy="30" r="22" fill="url(#nav-glow)" />
      <!-- Pulsing core -->
      <circle cx="30" cy="30" r="10" fill="url(#nav-core)" />
      
      <!-- Premium 3D Arrow -->
      <!-- Right half -->
      <path d="M30 6L46 42L30 35V6Z" fill="url(#arrow-right)" />
      <!-- Left half -->
      <path d="M30 6L14 42L30 35V6Z" fill="url(#arrow-left)" />
      <!-- Base highlight -->
      <path d="M14 42L30 35L46 42L30 38L14 42Z" fill="url(#arrow-base)" />
      
      <!-- Outline -->
      <path d="M30 6L46 42L30 35L14 42L30 6Z" stroke="url(#arrow-outline)" stroke-width="2" stroke-linejoin="round"/>
      
      <defs>
        <radialGradient id="nav-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="#00DDFF" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#00DDFF" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="nav-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9"/>
          <stop offset="50%" stop-color="#00DDFF" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="#0055FF" stop-opacity="0"/>
        </radialGradient>
        
        <linearGradient id="arrow-right" x1="30" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFFFFF"/>
          <stop offset="1" stop-color="#80DDFF"/>
        </linearGradient>
        <linearGradient id="arrow-left" x1="30" y1="6" x2="20" y2="42" gradientUnits="userSpaceOnUse">
          <stop stop-color="#E0F7FF"/>
          <stop offset="1" stop-color="#20A0FF"/>
        </linearGradient>
        <linearGradient id="arrow-base" x1="14" y1="42" x2="46" y2="42" gradientUnits="userSpaceOnUse">
          <stop stop-color="#20A0FF"/>
          <stop offset="0.5" stop-color="#0055FF"/>
          <stop offset="1" stop-color="#20A0FF"/>
        </linearGradient>
        <linearGradient id="arrow-outline" x1="30" y1="6" x2="30" y2="42" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFFFFF"/>
          <stop offset="1" stop-color="#00DDFF"/>
        </linearGradient>
      </defs>
    </svg>
    <div class="nav-pulse-ring-premium"></div>
  `;

  if (!document.getElementById('vehicle-nav-styles')) {
    const s = document.createElement('style');
    s.id = 'vehicle-nav-styles';
    s.textContent = `
      .nav-pulse-ring-premium {
        position: absolute; width: 60px; height: 60px; border-radius: 50%;
        border: 2px solid #00DDFF; top: 0px; left: 0px;
        box-shadow: 0 0 20px rgba(0,221,255,0.6), inset 0 0 10px rgba(0,221,255,0.4);
        animation: navPulsePremium 2s cubic-bezier(0.1, 0, 0.3, 1) infinite;
        pointer-events: none;
      }
      @keyframes navPulsePremium {
        0% { transform: scale(0.4); opacity: 1; border-width: 4px; }
        100% { transform: scale(1.6); opacity: 0; border-width: 1px; }
      }
    `;
    document.head.appendChild(s);
  }
  return el;
}

function createMarkerEl(type: 'start' | 'end') {
  const el = document.createElement('div');
  el.style.cssText = `
    width:38px;height:48px;cursor:pointer;
    background:${type === 'start'
      ? 'linear-gradient(135deg,#667eea,#764ba2)'
      : 'linear-gradient(135deg,#f093fb,#f5576c)'};
    border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    border:3px solid rgba(255,255,255,0.9);
    box-shadow:0 4px 20px ${type === 'start' ? 'rgba(102,126,234,0.7)' : 'rgba(240,147,251,0.7)'};
    display:flex;align-items:center;justify-content:center;
  `;
  const inner = document.createElement('div');
  inner.style.cssText = 'transform:rotate(45deg);color:white;font-weight:900;font-size:14px;font-family:DM Sans,sans-serif;';
  inner.textContent = type === 'start' ? 'A' : 'B';
  el.appendChild(inner);
  return el;
}

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const youAreHereMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeProgressRef = useRef<ReturnType<typeof buildRouteProgress> & { totalDistance: number; totalDuration: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'start' | 'end'>('start');
  const [cursorMode, setCursorMode] = useState(false);
  const [hoveredCoords, setHoveredCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [startLoc, setStartLoc] = useState<Location | null>(null);
  const [endLoc, setEndLoc] = useState<Location | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number; aqi?: ReturnType<typeof getAqiDisplay>; hideEta?: boolean } | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [liveRemaining, setLiveRemaining] = useState<{ distance: number; duration: number } | null>(null);

  // ── URL Params Initialization ───────────────────────────────────────────────
  useEffect(() => {
    const sl = searchParams.get('startLat'), sg = searchParams.get('startLng'), sn = searchParams.get('startName');
    const el = searchParams.get('endLat'), eg = searchParams.get('endLng'), en = searchParams.get('endName');
    let hasEnd = false;
    
    if (sl && sg) setStartLoc({ lat: parseFloat(sl), lng: parseFloat(sg), name: sn || 'Start' });
    if (el && eg) {
      setEndLoc({ lat: parseFloat(el), lng: parseFloat(eg), name: en || 'Destination' });
      setActiveTab('start');
      hasEnd = true;
    }
    // If routing from another page, auto-calculate route if we have both points
    if (sl && sg && el && eg) {
      // route will be drawn automatically via the startLoc/endLoc effect below once map loads
    }
  }, [searchParams]);

  // Handle auto-routing when both locations are set and map is ready
  useEffect(() => {
    if (startLoc && endLoc && mapRef.current && !loadingRoute && !routeInfo) {
      const isUrlParams = searchParams.get('startLat') && searchParams.get('endLat');
      if (isUrlParams) drawRoute();
    }
  }, [startLoc, endLoc, searchParams]);

  // ── Map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: NCR_CENTER,
      zoom: NCR_ZOOM,
      pitch: 40,
      bearing: -5,
    });

    m.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

    m.on('load', () => {
      // Atmosphere / fog effect for depth
      // Add 3D building extrusion from OSM data via CARTO source
      const layers = m.getStyle().layers;
      let labelLayerId: string | undefined;
      for (const layer of layers) {
        if (layer.type === 'symbol' && (layer as maplibregl.SymbolLayerSpecification).layout?.['text-field']) {
          labelLayerId = layer.id;
          break;
        }
      }

      // Try to add extruded buildings if the source has height data
      try {
        m.addLayer({
          id: 'ss-buildings-3d',
          type: 'fill-extrusion',
          source: 'carto',
          'source-layer': 'building',
          paint: {
            'fill-extrusion-color': '#1a1f35',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 20],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.6,
          },
        }, labelLayerId);
      } catch (_) { /* style doesn't support extrusions, skip */ }
    });

    // Cursor mode: click to set location
    m.on('click', (e) => {
      if (!cursorModeRef.current) return;
      const loc: Location = { lat: e.lngLat.lat, lng: e.lngLat.lng, name: `${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)}` };
      if (activeTabRef.current === 'start') {
        setStartLoc(loc);
        setActiveTab('end');
      } else {
        setEndLoc(loc);
        setCursorMode(false);
      }
    });

    m.on('mousemove', (e) => {
      if (cursorModeRef.current) setHoveredCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    m.on('mouseleave', () => setHoveredCoords(null));

    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; };
  }, []);

  // Refs to avoid stale closures in event handlers
  const cursorModeRef = useRef(cursorMode);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { cursorModeRef.current = cursorMode; }, [cursorMode]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Map cursor style
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getCanvas().style.cursor = cursorMode ? 'crosshair' : '';
  }, [cursorMode]);

  // ── Markers ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    startMarkerRef.current?.remove();
    if (startLoc && !isNavigating) {
      startMarkerRef.current = new maplibregl.Marker({ element: createMarkerEl('start'), anchor: 'bottom' })
        .setLngLat([startLoc.lng, startLoc.lat])
        .addTo(mapRef.current);
      mapRef.current.flyTo({ center: [startLoc.lng, startLoc.lat], zoom: 14, speed: 1.2 });
    }
  }, [startLoc, isNavigating]);

  useEffect(() => {
    if (!mapRef.current) return;
    endMarkerRef.current?.remove();
    if (endLoc) {
      endMarkerRef.current = new maplibregl.Marker({ element: createMarkerEl('end'), anchor: 'bottom' })
        .setLngLat([endLoc.lng, endLoc.lat])
        .addTo(mapRef.current);
      mapRef.current.flyTo({ center: [endLoc.lng, endLoc.lat], zoom: 13, speed: 1.2 });
    }
  }, [endLoc]);

  // ── Route ────────────────────────────────────────────────────────────────────
  const drawRoute = useCallback(async () => {
    if (!startLoc || !endLoc || !mapRef.current) return;
    setLoadingRoute(true);
    try {
      const m = mapRef.current;
      const waypoints = searchParams.get('waypoints') || undefined;
      const profile = searchParams.get('profile') || 'driving';
      
      const result = await getRoute(startLoc.lat, startLoc.lng, endLoc.lat, endLoc.lng, profile, waypoints);
      const aqiData = await getAqi(
        (startLoc.lat + endLoc.lat) / 2,
        (startLoc.lng + endLoc.lng) / 2
      ).catch(() => null);

      // Remove old route layers/sources
      ['route-glow', 'route-line'].forEach(id => { if (m.getLayer(id)) m.removeLayer(id); });
      if (m.getSource('route')) m.removeSource('route');

      // The backend returns a FeatureCollection of segments with a `congestion` property per feature.
      const featureCollection = result.geometry as GeoJSON.FeatureCollection;

      m.addSource('route', { type: 'geojson', data: featureCollection });

      // Glow layer (thicker, blurred) with color based on congestion
      m.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'congestion'], 'heavy'], '#ef4444', // red
            ['==', ['get', 'congestion'], 'moderate'], '#f97316', // orange
            '#3b82f6', // blue for low / default
          ],
          'line-width': 12,
          'line-opacity': 0.22,
          'line-blur': 7,
        },
      });

      // Main route line — same color scale but crisper
      m.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'congestion'], 'heavy'], '#ef4444',
            ['==', ['get', 'congestion'], 'moderate'], '#f97316',
            '#3b82f6',
          ],
          'line-width': 4,
          'line-opacity': 0.96,
        },
      });

      // Fit bounds to all segment coordinates
      const allCoords: [number, number][] = featureCollection.features.flatMap(
        (f: any) => (f.geometry?.coordinates || []) as [number, number][]
      );
      const bounds = allCoords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
      );
      m.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 380, right: 80 }, maxZoom: 15 });

      const aqi = aqiData ? getAqiDisplay(aqiData.aqi) : undefined;
      const hideEta = searchParams.get('hideEta') === '1';
      const features = (result.geometry as GeoJSON.FeatureCollection).features as GeoJSON.Feature<GeoJSON.LineString, { distance: number; duration_simulated?: number; duration_original?: number }>[];
      const progress = buildRouteProgress(features);
      routeProgressRef.current = { ...progress, totalDistance: result.distance_meters, totalDuration: result.duration_seconds };
      setRouteInfo({ distance: result.distance_meters, duration: result.duration_seconds, aqi, hideEta });
      setLiveRemaining(null);
      toast.success('Route calculated!');
    } catch {
      toast.error('Could not calculate route. Try different locations.');
    } finally {
      setLoadingRoute(false);
    }
  }, [startLoc, endLoc, searchParams]);

  const clearRoute = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    youAreHereMarkerRef.current?.remove();
    youAreHereMarkerRef.current = null;
    routeProgressRef.current = null;
    setIsNavigating(false);
    setLiveRemaining(null);
    const m = mapRef.current;
    if (!m) return;
    ['route-glow', 'route-line'].forEach(id => { if (m.getLayer(id)) m.removeLayer(id); });
    if (m.getSource('route')) m.removeSource('route');
    startMarkerRef.current?.remove();
    endMarkerRef.current?.remove();
    setStartLoc(null); setEndLoc(null); setRouteInfo(null);
    m.flyTo({ center: NCR_CENTER, zoom: NCR_ZOOM, pitch: 40, bearing: -5 });
  };

  const startNavigation = () => {
    if (!routeProgressRef.current || !mapRef.current) return;
    setIsNavigating(true);
    const m = mapRef.current;
    m.flyTo({ zoom: 17, pitch: 55, duration: 800 });
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const prog = routeProgressRef.current;
        if (!prog || prog.flatCoords.length < 2) return;
        const { flatCoords, segmentDistances, segmentDurations } = prog;
        const result = projectOntoRoute(
          pos.coords.latitude,
          pos.coords.longitude,
          flatCoords,
          segmentDistances,
          segmentDurations,
          prog.totalDistance,
          prog.totalDuration
        );
        setLiveRemaining({ distance: result.remainingDistance, duration: result.remainingDuration });
        if (!youAreHereMarkerRef.current && mapRef.current) {
          youAreHereMarkerRef.current = new maplibregl.Marker({
            element: createVehicleMarkerEl(),
            anchor: 'bottom',
          })
            .setLngLat(result.projectedLngLat)
            .addTo(mapRef.current);
        } else {
          youAreHereMarkerRef.current?.setLngLat(result.projectedLngLat);
        }
        m.easeTo({
          center: result.projectedLngLat,
          zoom: 17,
          pitch: 55,
          bearing: result.bearing,
          duration: 500,
          essential: true,
        });
      },
      () => toast.error('Location unavailable'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  };

  const stopNavigation = () => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    youAreHereMarkerRef.current?.remove();
    youAreHereMarkerRef.current = null;
    setIsNavigating(false);
    setLiveRemaining(null);
    mapRef.current?.easeTo({ pitch: 40, bearing: -5, zoom: 15, duration: 600 });
  };

  // ── Search ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { 
      searchPlaces('').then(res => setSearchResults(res.slice(0, 6))).catch(() => {});
      return; 
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        let viewbox = undefined;
        if (mapRef.current) {
          const b = mapRef.current.getBounds();
          viewbox = `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
        }
        
        const res = await searchPlaces(searchQuery, undefined, viewbox);
        setSearchResults(res.slice(0, 8));
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 400); // Debounce API calls
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const pickLandmark = (lm: typeof LANDMARKS[0]) => {
    const loc: Location = { lat: lm.lat, lng: lm.lng, name: lm.name };
    if (activeTab === 'start') { setStartLoc(loc); setActiveTab('end'); }
    else setEndLoc(loc);
    setShowSearch(false);
    setSearchQuery('');
  };

  // ── GPS ──────────────────────────────────────────────────────────────────────
  const useCurrentLocation = () => {
    setLoadingLoc(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: Location = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'My Location' };
        if (activeTab === 'start') { setStartLoc(loc); setActiveTab('end'); }
        else setEndLoc(loc);
        setLoadingLoc(false);
      },
      () => { toast.error('Location access denied'); setLoadingLoc(false); },
      { timeout: 8000 }
    );
  };

  const resetMap = () => { mapRef.current?.flyTo({ center: NCR_CENTER, zoom: NCR_ZOOM, pitch: 40 }); };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Map */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Coordinate tooltip in cursor mode */}
      <AnimatePresence>
        {cursorMode && hoveredCoords && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl text-sm font-mono text-white pointer-events-none"
            style={{ background: 'rgba(10,12,20,0.9)', border: '1px solid rgba(102,126,234,0.5)', backdropFilter: 'blur(12px)' }}>
            📍 {formatCoords(hoveredCoords.lat, hoveredCoords.lng)} — Click to pin
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset view button */}
      <button onClick={resetMap}
        className="absolute top-4 right-14 z-20 p-2.5 rounded-xl text-white/60 hover:text-white transition-all"
        style={{ background: 'rgba(10,12,20,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}
        title="Reset NCR view">
        <Maximize2 size={16} />
      </button>

      {/* ── Main Control Panel ─────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}
        className="absolute top-4 left-4 bottom-4 z-10 flex flex-col gap-3"
        style={{ width: 320 }}>

        {/* Header card */}
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{ background: 'rgba(8,10,18,0.92)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)' }}>
              <Navigation2 size={15} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Navigation</p>
              <p className="text-white/30 text-xs">Delhi NCR • Noida • Gurugram</p>
            </div>
          </div>
          {(startLoc || endLoc) && (
            <button onClick={clearRoute}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Location picker card */}
        <div className="rounded-2xl overflow-hidden flex flex-col"
          style={{ background: 'rgba(8,10,18,0.92)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}>

          {/* Tab switcher */}
          <div className="flex p-1.5 gap-1.5 relative" style={{ background: 'rgba(0,0,0,0.2)' }}>
            {(['start', 'end'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold relative z-10 transition-colors duration-200"
                style={activeTab === tab ? {
                  background: tab === 'start'
                    ? 'linear-gradient(135deg,#667eea,#764ba2)'
                    : 'linear-gradient(135deg,#f093fb,#f5576c)',
                  color: 'white',
                  boxShadow: tab === 'start' ? '0 2px 12px rgba(102,126,234,0.4)' : '0 2px 12px rgba(240,147,251,0.4)',
                } : { color: 'rgba(255,255,255,0.35)' }}>
                <div className="flex items-center justify-center gap-1.5">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs font-black"
                    style={{ background: activeTab === tab ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)' }}>
                    {tab === 'start' ? 'A' : 'B'}
                  </div>
                  {tab === 'start' ? 'Start' : 'Destination'}
                </div>
              </button>
            ))}
          </div>

          {/* Active location preview */}
          <div className="px-4 py-3">
            {(activeTab === 'start' ? startLoc : endLoc) ? (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: activeTab === 'start'
                      ? 'rgba(102,126,234,0.2)' : 'rgba(240,147,251,0.2)',
                    border: activeTab === 'start'
                      ? '1px solid rgba(102,126,234,0.4)' : '1px solid rgba(240,147,251,0.4)',
                  }}>
                  <MapPin size={14} style={{ color: activeTab === 'start' ? '#667eea' : '#f093fb' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {(activeTab === 'start' ? startLoc : endLoc)?.name}
                  </p>
                  <p className="text-white/30 text-xs">
                    {formatCoords(
                      (activeTab === 'start' ? startLoc : endLoc)!.lat,
                      (activeTab === 'start' ? startLoc : endLoc)!.lng
                    )}
                  </p>
                </div>
                <button onClick={() => activeTab === 'start' ? setStartLoc(null) : setEndLoc(null)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 transition-colors">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <p className="text-white/25 text-sm">
                {activeTab === 'start' ? 'Choose start point...' : 'Choose destination...'}
              </p>
            )}
          </div>

          <div className="px-4 pb-4 space-y-2">
            {/* GPS button */}
            <button onClick={useCurrentLocation} disabled={loadingLoc}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399' }}>
              {loadingLoc ? <Loader2 size={15} className="animate-spin" /> : <Locate size={15} />}
              Use My Current Location
            </button>

            {/* Cursor pick button */}
            <button onClick={() => setCursorMode(!cursorMode)}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all"
              style={cursorMode ? {
                background: 'rgba(245,158,11,0.2)',
                border: '1px solid rgba(245,158,11,0.4)',
                color: '#fbbf24',
              } : {
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.5)',
              }}>
              <MousePointer2 size={15} />
              {cursorMode ? '🖱 Click on the map to pin...' : 'Pick from Map'}
            </button>

            {/* Search button */}
            <button onClick={() => setShowSearch(!showSearch)}
              className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'rgba(102,126,234,0.1)', border: '1px solid rgba(102,126,234,0.2)', color: '#a5b4fc' }}>
              <span className="flex items-center gap-2"><Search size={15} />Search Landmarks</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${showSearch ? 'rotate-180' : ''}`} />
            </button>

            {/* Search results */}
            <AnimatePresence>
              {showSearch && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Type to search Delhi NCR landmarks..."
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white placeholder-white/25 mb-2 outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                    {searchResults.map(lm => (
                      <button key={lm.id} onClick={() => pickLandmark(lm)}
                        className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-all hover:bg-white/5">
                        <span className="text-base flex-shrink-0">
                          {lm.category === 'metro' ? '🚇' : lm.category === 'mall' ? '🏬' : lm.category === 'park' ? '🌳' : lm.category === 'hospital' ? '🏥' : lm.category === 'airport' ? '✈️' : lm.category === 'university' ? '🎓' : '📍'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{lm.name}</p>
                          <p className="text-white/30 text-xs truncate">{lm.address}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Get Route / Route Info */}
        <AnimatePresence mode="wait">
          {startLoc && endLoc && !routeInfo && (
            <motion.button key="get-route"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              onClick={drawRoute} disabled={loadingRoute}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-semibold text-white transition-all disabled:opacity-70"
              style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', boxShadow: '0 4px 24px rgba(102,126,234,0.4)' }}>
              {loadingRoute ? <Loader2 size={17} className="animate-spin" /> : <Route size={17} />}
              {loadingRoute ? 'Calculating...' : 'Get Route'}
            </motion.button>
          )}

          {routeInfo && (
            <motion.div key="route-info"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl p-4 space-y-3"
              style={{ background: 'rgba(8,10,18,0.92)', border: '1px solid rgba(102,126,234,0.2)', backdropFilter: 'blur(20px)' }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-white font-bold text-sm">Route Summary</p>
                <button onClick={clearRoute}
                  className="text-white/30 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded-lg hover:bg-red-500/10">
                  Clear
                </button>
              </div>
              <div className={`grid gap-2 ${routeInfo.hideEta && !isNavigating ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div className="rounded-xl p-3" style={{ background: 'rgba(102,126,234,0.1)', border: '1px solid rgba(102,126,234,0.2)' }}>
                  <div className="flex items-center gap-1.5 mb-1"><Route size={12} className="text-indigo-400" /><span className="text-white/40 text-xs">{isNavigating ? 'Remaining' : 'Distance'}</span></div>
                  <p className="text-white font-bold">{formatDistance(liveRemaining?.distance ?? routeInfo.distance)}</p>
                </div>
                {(!routeInfo.hideEta || isNavigating) && (
                  <div className="rounded-xl p-3" style={{ background: 'rgba(240,147,251,0.1)', border: '1px solid rgba(240,147,251,0.2)' }}>
                    <div className="flex items-center gap-1.5 mb-1"><Clock size={12} className="text-pink-400" /><span className="text-white/40 text-xs">{isNavigating ? 'ETA' : 'Duration'}</span></div>
                    <p className="text-white font-bold">{formatDuration(liveRemaining?.duration ?? routeInfo.duration)}</p>
                  </div>
                )}
              </div>
              {!routeInfo.hideEta && (
                <div className="flex gap-2">
                  {!isNavigating ? (
                    <button onClick={startNavigation}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                      style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', boxShadow: '0 2px 12px rgba(34,197,94,0.3)' }}>
                      <Play size={16} /> Start
                    </button>
                  ) : (
                    <button onClick={stopNavigation}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                      style={{ background: 'rgba(239,68,68,0.9)', boxShadow: '0 2px 12px rgba(239,68,68,0.3)' }}>
                      <Square size={16} /> Stop
                    </button>
                  )}
                </div>
              )}
              {routeInfo.aqi && (
                <div className="rounded-xl p-3 flex items-center justify-between"
                  style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2"><Wind size={13} className="text-white/40" /><span className="text-white/50 text-xs">Air Quality</span></div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm" style={{ color: routeInfo.aqi.color }}>{routeInfo.aqi.label}</span>
                    <div className="w-2 h-2 rounded-full" style={{ background: routeInfo.aqi.color }} />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Map style info */}
        <div className="mt-auto flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(8,10,18,0.7)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <Layers size={12} className="text-white/25" />
          <span className="text-white/25 text-xs">CARTO Dark Matter • Delhi NCR Region</span>
        </div>
      </motion.div>
    </div>
  );
}
