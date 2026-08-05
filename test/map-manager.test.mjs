import test from 'node:test';
import assert from 'node:assert/strict';
import { MapInitializationError, MapManager } from '../js/map/map-manager.js';

class FakeElement { getBoundingClientRect() { return { width: 900, height: 500 }; } }
class FakeMap {
  constructor(options) { this.options = options; this.handlers = new Map(); this.style = { layers: [] }; }
  addControl() {}
  on(name, handler) { this.handlers.set(name, handler); }
  once(name, handler) { this.handlers.set(name, handler); }
  emit(name, payload) { this.handlers.get(name)?.(payload); }
  setStyle(url) { this.styleUrl = url; }
  getStyle() { return this.style; }
  resize() { this.resized = true; }
  remove() {}
}

function installBrowserMocks({ webgl = true } = {}) {
  const element = new FakeElement();
  globalThis.HTMLElement = FakeElement;
  globalThis.document = { getElementById: id => id === 'map' ? element : null, createElement: () => ({ getContext: () => webgl ? {} : null }) };
  globalThis.ResizeObserver = class { observe(value) { this.observed = value; installBrowserMocks.observed = value; } disconnect() {} };
  globalThis.maplibregl = { Map: FakeMap, NavigationControl: class {}, FullscreenControl: class {}, GeolocateControl: class {}, ScaleControl: class {} };
  return element;
}

test('resolves the map id to an HTMLElement before ResizeObserver', () => { const element = installBrowserMocks(); const manager = new MapManager('map', { mapStyle: 'liberty' }, () => {}).init(); assert.equal(manager.container, element); assert.equal(installBrowserMocks.observed, element); });
test('falls back from Liberty to Positron once', () => { installBrowserMocks(); const preferences = { mapStyle: 'liberty' }, manager = new MapManager('map', preferences, () => {}).init(); manager.map.emit('error', { error: new Error('Failed to fetch style') }); assert.match(manager.map.styleUrl, /positron/); assert.equal(preferences.mapStyle, 'positron'); });
test('switches explicitly to Positron and Dark styles', () => { installBrowserMocks(); const preferences = { mapStyle: 'liberty' }, manager = new MapManager('map', preferences, () => {}).init(); assert.equal(manager.setStyle('positron'), true); assert.match(manager.map.styleUrl, /positron/); assert.equal(manager.setStyle('dark'), true); assert.match(manager.map.styleUrl, /dark/); });
test('reports WebGL unavailable precisely', () => { installBrowserMocks({ webgl: false }); assert.throws(() => new MapManager('map', { mapStyle: 'liberty' }, () => {}).init(), error => error instanceof MapInitializationError && error.code === 'WEBGL_UNAVAILABLE'); });
