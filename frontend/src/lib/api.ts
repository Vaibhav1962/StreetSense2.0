/// <reference types="vite/client" />
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000, // 60s timeout
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ss_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear token and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export interface UserRead {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserRead;
}

export async function login(username: string, password: string): Promise<TokenResponse> {
  const form = new URLSearchParams();
  form.append('username', username);
  form.append('password', password);
  const res = await api.post('/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return res.data;
}

export async function getMe(): Promise<UserRead> {
  const res = await api.get('/auth/me');
  return res.data;
}

// ── Places ────────────────────────────────────────────────────────────────────
export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

export async function searchPlaces(q: string, category?: string, viewbox?: string): Promise<PlaceResult[]> {
  const params: Record<string, string> = { q };
  if (category) params.category = category;
  if (viewbox) params.viewbox = viewbox;
  const res = await api.get('/places/search', { params });
  return res.data;
}

export async function listLandmarks(category?: string): Promise<PlaceResult[]> {
  const params: Record<string, string> = {};
  if (category) params.category = category;
  const res = await api.get('/places/landmarks', { params });
  return res.data;
}

// ── Routing ───────────────────────────────────────────────────────────────────
export interface RouteResult {
  distance_meters: number;
  duration_seconds: number; // traffic-adjusted duration
  duration_original?: number; // base duration from OSRM (no traffic)
  geometry: GeoJSON.FeatureCollection<
    GeoJSON.LineString,
    { congestion: 'low' | 'moderate' | 'heavy'; duration_original: number; duration_simulated: number; distance: number }
  >;
  steps: { instruction: string; distance: number; duration: number }[];
}

export async function getRoute(
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  profile = 'driving',
  waypoints?: string
): Promise<RouteResult> {
  const params: Record<string, any> = { start_lat: startLat, start_lng: startLng, end_lat: endLat, end_lng: endLng, profile };
  if (waypoints) params.waypoints = waypoints;
  
  const res = await api.get('/routing/route', { params });
  return res.data;
}

export async function getAqi(lat: number, lng: number) {
  const res = await api.get('/routing/aqi', { params: { lat, lng } });
  return res.data;
}
