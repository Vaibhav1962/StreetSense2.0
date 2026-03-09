export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hrs}h ${remaining}m`;
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`;
}

export function getAqiColor(aqi: number): string {
  if (aqi <= 50) return '#00e400';
  if (aqi <= 100) return '#ffff00';
  if (aqi <= 150) return '#ff7e00';
  if (aqi <= 200) return '#ff0000';
  if (aqi <= 300) return '#8f3f97';
  return '#7e0023';
}

export function getAqiLabel(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

export function getAqiDisplay(aqi: number) {
  return { label: getAqiLabel(aqi), color: getAqiColor(aqi) };
}

export function isInDelhiNCR(lat: number, lng: number): boolean {
  return lat >= 28.4 && lat <= 28.85 && lng >= 76.8 && lng <= 77.6;
}

/** Haversine distance in meters */
export function haversineMeters(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Bearing in degrees (0=North, 90=East) from point A to B */
export function getBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const lat1r = (lat1 * Math.PI) / 180;
  const lat2r = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/** Project point onto polyline and return { traveledDistance, traveledDuration, remainingDistance, remainingDuration, bearing } */
export function projectOntoRoute(
  userLat: number,
  userLng: number,
  flatCoords: [number, number][],
  segmentDistances: number[],
  segmentDurations: number[],
  totalDistance: number,
  totalDuration: number
): {
  traveledDistance: number;
  traveledDuration: number;
  remainingDistance: number;
  remainingDuration: number;
  projectedLngLat: [number, number];
  bearing: number;
} {
  if (flatCoords.length < 2 || segmentDistances.length === 0) {
    return {
      traveledDistance: 0,
      traveledDuration: 0,
      remainingDistance: totalDistance,
      remainingDuration: totalDuration,
      projectedLngLat: flatCoords[0] || [userLng, userLat],
      bearing: 0,
    };
  }
  let bestSeg = 0;
  let bestFrac = 0;
  let bestDist = Infinity;
  for (let i = 0; i < flatCoords.length - 1; i++) {
    const [x1, y1] = flatCoords[i];
    const [x2, y2] = flatCoords[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1e-9;
    const t = Math.max(0, Math.min(1, ((userLng - x1) * dx + (userLat - y1) * dy) / (len * len)));
    const projLng = x1 + t * dx;
    const projLat = y1 + t * dy;
    const d = haversineMeters(userLat, userLng, projLat, projLng);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i;
      bestFrac = t;
    }
  }
  let traveledDist = 0;
  let traveledDur = 0;
  for (let i = 0; i < bestSeg; i++) {
    traveledDist += segmentDistances[i];
    traveledDur += segmentDurations[i];
  }
  traveledDist += bestFrac * (segmentDistances[bestSeg] ?? 0);
  traveledDur += bestFrac * (segmentDurations[bestSeg] ?? 0);
  const [x1, y1] = flatCoords[bestSeg];
  const [x2, y2] = flatCoords[bestSeg + 1];
  const projLng = x1 + bestFrac * (x2 - x1);
  const projLat = y1 + bestFrac * (y2 - y1);
  const [px1, py1] = flatCoords[bestSeg];
  const [px2, py2] = flatCoords[bestSeg + 1];
  const bearing = getBearing(py1, px1, py2, px2);
  return {
    traveledDistance: traveledDist,
    traveledDuration: traveledDur,
    remainingDistance: totalDistance - traveledDist,
    remainingDuration: totalDuration - traveledDur,
    projectedLngLat: [projLng, projLat],
    bearing,
  };
}

/** Build flat coords + segment distances/durations from route FeatureCollection */
export function buildRouteProgress(
  features: GeoJSON.Feature<GeoJSON.LineString, { distance: number; duration_simulated?: number; duration_original?: number }>[]
): {
  flatCoords: [number, number][];
  segmentDistances: number[];
  segmentDurations: number[];
} {
  const flatCoords: [number, number][] = [];
  const segmentDistances: number[] = [];
  const segmentDurations: number[] = [];
  for (const f of features) {
    const coords = f.geometry?.coordinates as [number, number][] | undefined;
    if (!coords || coords.length < 2) continue;
    const totalDur = f.properties?.duration_simulated ?? f.properties?.duration_original ?? 0;
    const segLens: number[] = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const [lng1, lat1] = coords[i];
      const [lng2, lat2] = coords[i + 1];
      segLens.push(haversineMeters(lat1, lng1, lat2, lng2));
    }
    const segLenSum = segLens.reduce((a, b) => a + b, 0);
    for (let i = 0; i < segLens.length; i++) {
      segmentDistances.push(segLens[i]);
      segmentDurations.push(segLenSum > 0 ? (segLens[i] / segLenSum) * totalDur : totalDur / segLens.length);
    }
    const last = flatCoords[flatCoords.length - 1];
    for (let i = 0; i < coords.length; i++) {
      if (i === 0 && last && last[0] === coords[i][0] && last[1] === coords[i][1]) continue;
      flatCoords.push(coords[i]);
    }
  }
  return { flatCoords, segmentDistances, segmentDurations };
}
