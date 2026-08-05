import { APP_CONFIG } from '../config.js';

export class MapManager {
  constructor(container, preferences, onMapClick) { this.container = container; this.preferences = preferences; this.onMapClick = onMapClick; }
  init() {
    this.map = new maplibregl.Map({ container: this.container, style: APP_CONFIG.styles[this.preferences.mapStyle]?.url || APP_CONFIG.styles.liberty.url, center: APP_CONFIG.defaultCenter, zoom: 13, attributionControl: true, cooperativeGestures: true });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    this.map.addControl(new maplibregl.FullscreenControl(), 'top-left');
    this.map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true }), 'top-left');
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    this.map.on('click', event => this.onMapClick({ latitude: event.lngLat.lat, longitude: event.lngLat.lng, source: 'map-click' }));
    this.map.on('load', () => { this.loaded = true; this.localizeLabels(); this.onReady?.(); });
    this.resizeObserver = new ResizeObserver(() => this.map.resize()); this.resizeObserver.observe(this.container);
    return this;
  }
  localizeLabels() { for (const layer of this.map.getStyle().layers || []) { const field = layer.layout?.['text-field']; if (field && layer.type === 'symbol') try { this.map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ar'], ['get', 'name'], ['get', 'name:en']]); } catch { /* style layer does not support this expression */ } } }
  setStyle(styleId) { const style = APP_CONFIG.styles[styleId]; if (!style) return; this.preferences.mapStyle = styleId; this.map.setStyle(style.url); this.map.once('style.load', () => this.localizeLabels()); }
  fitPoints(points, padding = 70) { if (!points.length) return; if (points.length === 1) return this.map.easeTo({ center: [points[0].longitude, points[0].latitude], zoom: 16 }); const bounds = points.reduce((box, point) => box.extend([point.longitude, point.latitude]), new maplibregl.LngLatBounds()); this.map.fitBounds(bounds, { padding, maxZoom: 16, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700 }); }
  destroy() { this.resizeObserver?.disconnect(); this.map?.remove(); }
}
