const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = value => value * Math.PI / 180;

export function haversineMeters(a, b) {
  const lat1 = Number(a.latitude ?? a.lat), lng1 = Number(a.longitude ?? a.lng);
  const lat2 = Number(b.latitude ?? b.lat), lng2 = Number(b.longitude ?? b.lng);
  const dLat = toRadians(lat2 - lat1), dLng = toRadians(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function estimateFuelLiters(distanceMeters, consumptionPer100Km) {
  return Math.max(0, Number(distanceMeters)) / 1000 * Math.max(0, Number(consumptionPer100Km)) / 100;
}

export function toLngLat(point) { return [Number(point.longitude ?? point.lng), Number(point.latitude ?? point.lat)]; }
