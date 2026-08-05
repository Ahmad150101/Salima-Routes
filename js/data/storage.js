import { APP_CONFIG } from '../config.js';
import { createDefaultState, migrateState } from './migration.js';

export class StorageManager {
  constructor(storage = localStorage) { this.storage = storage; this.corruptBackup = null; }
  load() {
    const current = this.storage.getItem(APP_CONFIG.storageKey);
    if (current) { try { return migrateState(JSON.parse(current)); } catch { this.corruptBackup = current; return { ...createDefaultState(), storageWarning: true }; } }
    const legacy = this.#loadLegacy();
    const state = migrateState(legacy);
    if (legacy.customers.length || legacy.warehouse) this.save(state);
    return state;
  }
  #loadLegacy() {
    const parse = (key, fallback) => { try { return JSON.parse(this.storage.getItem(key)) ?? fallback; } catch { return fallback; } };
    return { customers: parse(APP_CONFIG.legacyKeys.customers, []), warehouse: parse(APP_CONFIG.legacyKeys.warehouse, null), settings: parse(APP_CONFIG.legacyKeys.settings, {}) };
  }
  save(state) { this.storage.setItem(APP_CONFIG.storageKey, JSON.stringify({ ...state, schemaVersion: APP_CONFIG.schemaVersion })); }
  downloadCorruptBackup() { if (!this.corruptBackup) return false; const blob = new Blob([this.corruptBackup], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `salima-routes-corrupt-${Date.now()}.json`; link.click(); URL.revokeObjectURL(link.href); return true; }
  reset() { this.storage.removeItem(APP_CONFIG.storageKey); }
}
