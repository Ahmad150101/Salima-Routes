import { APP_CONFIG } from '../config.js';
import { uid } from '../utils/format.js';
import { validCoordinates } from '../utils/validation.js';

const now = () => new Date().toISOString();
export function normalizeCustomer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const latitude = Number(raw.latitude ?? raw.lat), longitude = Number(raw.longitude ?? raw.lng);
  if (!String(raw.name ?? '').trim() || !validCoordinates(latitude, longitude)) return null;
  const createdAt = raw.createdAt || now();
  return Object.freeze({ schemaVersion: APP_CONFIG.schemaVersion, id: String(raw.id || uid()), name: String(raw.name).trim().slice(0, 80), latitude, longitude, accuracy: Number.isFinite(Number(raw.accuracy)) ? Number(raw.accuracy) : null, source: ({ gps: 'current-location', map: 'map-click' }[raw.source] || raw.source || 'map-click'), hasOrder: raw.hasOrder !== false, createdAt, updatedAt: raw.updatedAt || createdAt });
}

export function createDefaultState() {
  return { schemaVersion: APP_CONFIG.schemaVersion, customers: [], warehouse: null, vehicleSettings: { consumptionPer100Km: 9.5, fuelPrice: null }, routePreferences: { returnToWarehouse: true }, uiPreferences: { theme: null, mapStyle: 'liberty', customerNamesVisible: true, onboardingSeen: false } };
}

export function migrateState(raw = {}) {
  const base = createDefaultState();
  const customers = (Array.isArray(raw) ? raw : raw.customers || []).map(normalizeCustomer).filter(Boolean);
  const warehouseRaw = raw.warehouse || raw.depot;
  const warehouse = warehouseRaw && validCoordinates(warehouseRaw.latitude ?? warehouseRaw.lat, warehouseRaw.longitude ?? warehouseRaw.lng) ? { latitude: Number(warehouseRaw.latitude ?? warehouseRaw.lat), longitude: Number(warehouseRaw.longitude ?? warehouseRaw.lng), accuracy: Number.isFinite(Number(warehouseRaw.accuracy)) ? Number(warehouseRaw.accuracy) : null, source: warehouseRaw.source || 'map-click', updatedAt: warehouseRaw.updatedAt || now() } : null;
  return { ...base, ...raw, schemaVersion: APP_CONFIG.schemaVersion, customers, warehouse, vehicleSettings: { ...base.vehicleSettings, ...(raw.vehicleSettings || raw.settings) }, routePreferences: { ...base.routePreferences, ...(raw.routePreferences || {}), returnToWarehouse: raw.returnDepot ?? raw.routePreferences?.returnToWarehouse ?? base.routePreferences.returnToWarehouse }, uiPreferences: { ...base.uiPreferences, ...(raw.uiPreferences || {}) } };
}
