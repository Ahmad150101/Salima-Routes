import { APP_CONFIG } from '../config.js';

let setupPromise = null;

export function rtlPluginStatus() {
  try { return globalThis.maplibregl?.getRTLTextPluginStatus?.() || 'unavailable'; }
  catch { return 'unavailable'; }
}

/** Loads MapLibre's RTL shaping plugin once and never blocks map startup on failure. */
export async function ensureRTLTextPlugin() {
  const api = globalThis.maplibregl;
  if (!api?.setRTLTextPlugin) return { ok: false, status: 'unavailable', reason: 'library' };
  const status = rtlPluginStatus();
  if (status === 'loaded') return { ok: true, status };
  if (setupPromise) return setupPromise;
  if (!['unavailable', 'deferred'].includes(status)) return { ok: false, status, reason: status };
  setupPromise = Promise.resolve(api.setRTLTextPlugin(APP_CONFIG.rtlPluginUrl, false))
    .then(() => ({ ok: rtlPluginStatus() === 'loaded', status: rtlPluginStatus() }))
    .catch(error => ({ ok: false, status: rtlPluginStatus(), reason: 'network-or-csp', error }));
  return setupPromise;
}

export function retryRTLTextPlugin() {
  const status = rtlPluginStatus();
  if (status === 'unavailable' || status === 'deferred') { setupPromise = null; return ensureRTLTextPlugin(); }
  return Promise.resolve({ ok: status === 'loaded', status, reloadRequired: status === 'error' });
}

export function resetRTLPluginForTests() { setupPromise = null; }
