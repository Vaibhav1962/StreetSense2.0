import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, MapPin, Phone, Clock, Navigation2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { LANDMARKS, type Landmark } from '../lib/landmarks';
import { formatCoords } from '../lib/utils';

const HOSPITALS = LANDMARKS.filter(l => l.category === 'hospital');

type HospitalWithDistance = Landmark & { distKm?: number };

const EMERGENCY_LINES = [
  { name: 'Police', number: '100', color: '#3b82f6' },
  { name: 'Ambulance', number: '102', color: '#ef4444' },
  { name: 'Fire', number: '101', color: '#f97316' },
  { name: 'Emergency', number: '112', color: '#8b5cf6' },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function EmergencyPage() {
  const navigate = useNavigate();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hospitals, setHospitals] = useState<HospitalWithDistance[]>(HOSPITALS);
  const [loading, setLoading] = useState(false);

  function findNearest() {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLocation({ lat, lng });

        try {
          // First try Overpass API with a generous radius around the user (covers Delhi, Noida, Ghaziabad, etc.)
          const radius = 25000; // 25km
          const overpassQuery = `[out:json][timeout:12];(node["amenity"="hospital"](around:${radius},${lat},${lng});way["amenity"="hospital"](around:${radius},${lat},${lng});relation["amenity"="hospital"](around:${radius},${lat},${lng}););out center;`;

          const overpassRes = await axios.get('https://overpass-api.de/api/interpreter', {
            params: { data: overpassQuery },
          });

          let dynamicHospitals: HospitalWithDistance[] = [];

          if (overpassRes.data && Array.isArray(overpassRes.data.elements)) {
            dynamicHospitals = overpassRes.data.elements
              .filter((item: any) => item.tags && item.tags.name)
              .map((item: any) => {
                const hLat = item.lat || (item.center && item.center.lat);
                const hLng = item.lon || (item.center && item.center.lon);
                return {
                  id: item.id.toString(),
                  name: item.tags.name,
                  address: item.tags['addr:full'] || item.tags['name:en'] || item.tags.name,
                  category: 'hospital',
                  lat: hLat,
                  lng: hLng,
                  distKm: haversineKm(lat, lng, hLat, hLng),
                };
              });
          }

          // If Overpass didn't return anything (or very few), fall back to Nominatim search
          if (dynamicHospitals.length < 3) {
            const offset = 0.35; // ~35km box around user — enough for cross-city NCR hops
            const nominatimRes = await axios.get('https://nominatim.openstreetmap.org/search', {
              params: {
                q: 'hospital',
                format: 'json',
                addressdetails: 1,
                viewbox: `${lng - offset},${lat + offset},${lng + offset},${lat - offset}`,
                bounded: 1,
                limit: 30,
              },
              headers: { 'User-Agent': 'StreetSense/3.0 Emergency' },
            });

            if (Array.isArray(nominatimRes.data)) {
              const nomHospitals: HospitalWithDistance[] = nominatimRes.data.map((item: any) => {
                const hLat = parseFloat(item.lat);
                const hLng = parseFloat(item.lon);
                return {
                  id: item.place_id.toString(),
                  name: item.display_name.split(',')[0],
                  address: item.display_name,
                  category: 'hospital',
                  lat: hLat,
                  lng: hLng,
                  distKm: haversineKm(lat, lng, hLat, hLng),
                };
              });
              dynamicHospitals = [...dynamicHospitals, ...nomHospitals];
            }
          }

          const allHospitals: HospitalWithDistance[] = [
            ...(HOSPITALS as HospitalWithDistance[]),
            ...dynamicHospitals,
          ];
          // Remove duplicates by name (most stable across APIs)
          const unique = Array.from(new Map(allHospitals.map((h) => [h.name, h])).values());
          unique.forEach((h) => {
            h.distKm = haversineKm(lat, lng, h.lat, h.lng);
          });
          setHospitals(unique.sort((a, b) => (a.distKm ?? 0) - (b.distKm ?? 0)).slice(0, 18));
        } catch {
          const sorted = HOSPITALS.map((h) => ({
            ...h,
            distKm: haversineKm(lat, lng, h.lat, h.lng),
          })).sort((a, b) => (a.distKm ?? 0) - (b.distKm ?? 0));
          setHospitals(sorted);
        }
        setLoading(false);
      },
      () => {
        setLoading(false);
        setHospitals(HOSPITALS);
      },
      { timeout: 8000 }
    );
  }

  function openMaps(h: HospitalWithDistance) {
    if (userLocation) {
      navigate(`/map?startLat=${userLocation.lat}&startLng=${userLocation.lng}&startName=My+Location&endLat=${h.lat}&endLng=${h.lng}&endName=${encodeURIComponent(h.name)}`);
    } else {
      navigate(`/map?endLat=${h.lat}&endLng=${h.lng}&endName=${encodeURIComponent(h.name)}`);
    }
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-auto"
      style={{ background: 'linear-gradient(135deg, #070a12 0%, #0f1520 100%)' }}>

      {/* SOS Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #ef4444 0%, #be123c 100%)' }}>
            <AlertTriangle size={20} className="text-white" />
          </motion.div>
          <div>
            <h1 className="text-2xl font-bold text-white">Emergency Services</h1>
            <p className="text-white/40 text-sm">Find nearest hospitals & emergency numbers</p>
          </div>
        </div>
      </motion.div>

      {/* Emergency Numbers */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-4 gap-3 mb-6">
        {EMERGENCY_LINES.map((line, i) => (
          <motion.a key={line.name} href={`tel:${line.number}`}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            className="glass-panel rounded-2xl p-4 text-center block cursor-pointer">
            <Phone size={20} className="mx-auto mb-2" style={{ color: line.color }} />
            <p className="text-white font-bold text-xl">{line.number}</p>
            <p className="text-white/50 text-xs mt-1">{line.name}</p>
          </motion.a>
        ))}
      </motion.div>

      {/* Find nearest CTA */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-6">
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={findNearest}
          disabled={loading}
          className="flex items-center gap-3 px-6 py-3.5 rounded-2xl font-semibold text-white transition-all disabled:opacity-60"
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #be123c 100%)',
            boxShadow: '0 4px 20px rgba(239,68,68,0.3)',
          }}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Navigation2 size={18} />}
          Find Nearest Hospitals
          {userLocation && (
            <span className="text-xs opacity-70 ml-2">
              ({formatCoords(userLocation.lat, userLocation.lng)})
            </span>
          )}
        </motion.button>
      </motion.div>

      {/* Hospital List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 flex-1">
        {hospitals.map((h, i) => (
          <motion.div key={h.id}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="glass-panel rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                🏥
              </div>
              {h.distKm !== undefined && (
                <span className="text-xs font-semibold px-2 py-1 rounded-full"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                  {h.distKm < 1 ? `${Math.round(h.distKm * 1000)} m` : `${h.distKm.toFixed(1)} km`}
                </span>
              )}
            </div>
            <h3 className="text-white font-bold mb-1">{h.name}</h3>
            <div className="flex items-start gap-1.5 mb-4">
              <MapPin size={12} className="text-white/30 mt-0.5 flex-shrink-0" />
              <p className="text-white/40 text-xs">{h.address}</p>
            </div>
            <div className="flex items-center gap-2 text-white/30 text-xs mb-4">
              <Clock size={11} />
              <span>24/7 Emergency</span>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => openMaps(h)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #be123c 100%)',
                boxShadow: '0 2px 12px rgba(239,68,68,0.3)',
              }}>
              <Navigation2 size={14} />
              Navigate →
            </motion.button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
