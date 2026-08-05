import { APP_CONFIG } from '../config.js';

export class MapInitializationError extends Error {
  constructor(code, message, cause) { super(message, { cause }); this.name = 'MapInitializationError'; this.code = code; }
}

function resolveContainer(container) {
  const element = typeof container === 'string' ? document.getElementById(container) : container;
  if (!(element instanceof HTMLElement)) throw new MapInitializationError('CONTAINER_MISSING', 'عنصر الخريطة غير موجود.');
  const bounds = element.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) throw new MapInitializationError('CONTAINER_SIZE', 'مساحة الخريطة غير جاهزة بعد.');
  return element;
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch { return false; }
}

export class MapManager {
  constructor(container, preferences, onMapClick) {
    this.container = resolveContainer(container);
    this.preferences = preferences;
    this.onMapClick = onMapClick;
    this.styleId = APP_CONFIG.styles[preferences.mapStyle] ? preferences.mapStyle : 'liberty';
  }

  init() {
    if (!globalThis.maplibregl?.Map) throw new MapInitializationError('LIBRARY_MISSING', 'تعذر تحميل مكتبة الخريطة.');
    if (!hasWebGL()) throw new MapInitializationError('WEBGL_UNAVAILABLE', 'WebGL غير متوفر أو معطل في هذا المتصفح.');
    try {
      this.map = new maplibregl.Map({ container: this.container, style: APP_CONFIG.styles[this.styleId].url, center: APP_CONFIG.defaultCenter, zoom: 13, attributionControl: true, cooperativeGestures: true });
    } catch (error) {
      throw new MapInitializationError('MAP_CONSTRUCTION', 'تعذر إنشاء خريطة MapLibre.', error);
    }
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    this.map.addControl(new maplibregl.FullscreenControl(), 'top-left');
    this.map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true }), 'top-left');
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    this.map.on('click', event => this.onMapClick({ latitude: event.lngLat.lat, longitude: event.lngLat.lng, source: 'map-click' }));
    this.map.on('style.load', () => this.#ready());
    this.map.on('load', () => this.#ready());
    this.map.on('error', event => this.#handleMapError(event?.error));
    if ('ResizeObserver' in globalThis) { this.resizeObserver = new ResizeObserver(() => this.map.resize()); this.resizeObserver.observe(this.container); }
    else { this.windowResizeHandler = () => this.map.resize(); addEventListener('resize', this.windowResizeHandler, { passive: true }); }
    return this;
  }

  #ready() { if (this.loaded) return; this.loaded = true; this.localizeLabels(); this.map.resize(); this.onReady?.(this.styleId); }

  #handleMapError(error) {
    if (this.loaded) { this.onResourceError?.(error); return; }
    if (!this.loaded && this.styleId === 'liberty' && !this.fallbackTried) {
      this.fallbackTried = true;
      this.styleId = 'positron';
      this.preferences.mapStyle = 'positron';
      this.onFallback?.('positron');
      this.map.setStyle(APP_CONFIG.styles.positron.url);
      return;
    }
    const message = String(error?.message || 'تعذر تحميل مورد من خادم الخرائط.');
    const code = /fetch|network|failed|cors/i.test(message) ? 'MAP_SERVER_CONNECTION' : 'STYLE_LOAD_FAILED';
    this.onError?.(new MapInitializationError(code, code === 'MAP_SERVER_CONNECTION' ? 'فشل الاتصال بخادم الخرائط.' : 'تعذر تحميل نمط الخريطة.', error));
  }

  localizeLabels() {
    const placeLayerPattern = /(^|[-_])(place|poi|airport|label)([-_]|$)|(^|[-_])(city|town|village|state|country|suburb)([-_]|$)/i;
    for (const layer of this.map.getStyle().layers || []) {
      const field = layer.layout?.['text-field'];
      if (layer.type !== 'symbol' || !field || !placeLayerPattern.test(`${layer.id} ${layer['source-layer'] || ''}`)) continue;
      const serialized = JSON.stringify(field);
      if (!serialized.includes('name') || serialized.includes('"ref"')) continue;
      try { this.map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ar'], ['get', 'name'], ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:nonlatin']]); }
      catch { /* Preserve third-party layers that reject the localized expression. */ }
    }
  }

  setStyle(styleId) {
    const style = APP_CONFIG.styles[styleId];
    if (!style) return false;
    this.styleId = styleId;
    this.preferences.mapStyle = styleId;
    this.map.setStyle(style.url);
    this.map.once('style.load', () => { this.localizeLabels(); this.map.resize(); this.onStyleReady?.(styleId); });
    return true;
  }

  fitPoints(points, padding = 70) { if (!points.length) return; if (points.length === 1) return this.map.easeTo({ center: [points[0].longitude, points[0].latitude], zoom: 16 }); const bounds = points.reduce((box, point) => box.extend([point.longitude, point.latitude]), new maplibregl.LngLatBounds()); this.map.fitBounds(bounds, { padding, maxZoom: 16, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700 }); }
  resize() { this.map?.resize(); }
  destroy() { this.resizeObserver?.disconnect(); if (this.windowResizeHandler) removeEventListener('resize', this.windowResizeHandler); this.map?.remove(); }
}
