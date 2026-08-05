import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRTLTextPlugin, resetRTLPluginForTests } from '../js/map/rtl-plugin.js';

test.afterEach(() => { delete globalThis.maplibregl; resetRTLPluginForTests(); });

test('does not register an already loaded RTL plugin', async () => { let calls = 0; globalThis.maplibregl = { getRTLTextPluginStatus: () => 'loaded', setRTLTextPlugin: () => { calls++; } }; const result = await ensureRTLTextPlugin(); assert.equal(result.ok, true); assert.equal(calls, 0); });
test('loads the RTL plugin only once before concurrent map starts continue', async () => { let calls = 0, status = 'unavailable'; globalThis.maplibregl = { getRTLTextPluginStatus: () => status, setRTLTextPlugin: async url => { calls++; assert.match(url, /@0\.3\.0/); status = 'loaded'; } }; const [first, second] = await Promise.all([ensureRTLTextPlugin(), ensureRTLTextPlugin()]); assert.equal(calls, 1); assert.equal(first.ok, true); assert.equal(second.ok, true); });
test('returns a nonfatal result when the RTL plugin is blocked', async () => { globalThis.maplibregl = { getRTLTextPluginStatus: () => 'unavailable', setRTLTextPlugin: async () => { throw new Error('CSP blocked'); } }; const result = await ensureRTLTextPlugin(); assert.equal(result.ok, false); assert.equal(result.reason, 'network-or-csp'); });
