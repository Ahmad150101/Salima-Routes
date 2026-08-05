export class RouteRenderer {
  constructor(map) { this.map = map; this.map.on('style.load', () => { if (this.last) this.#render(this.last.geometry, this.last.fallback, false); }); }
  clear(preserveLast = false) { for (const id of ['route-line', 'route-line-fallback']) { if (this.map.getLayer(id)) this.map.removeLayer(id); if (this.map.getSource(id)) this.map.removeSource(id); } this.bounds = null; if (!preserveLast) this.last = null; }
  draw(geometry, fallback = false) { this.last = { geometry, fallback }; this.#render(geometry, fallback, true); }
  #render(geometry, fallback, shouldFit) { this.clear(true); const id = fallback ? 'route-line-fallback' : 'route-line'; this.map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry } }); this.map.addLayer({ id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': fallback ? '#e69516' : '#1265a8', 'line-width': 6, 'line-opacity': .9, ...(fallback ? { 'line-dasharray': [2, 2] } : {}) } }); this.bounds = geometry.coordinates.reduce((box, coordinate) => box.extend(coordinate), new maplibregl.LngLatBounds()); if (shouldFit) this.fit(); }
  fit() { if (this.bounds && !this.bounds.isEmpty()) this.map.fitBounds(this.bounds, { padding: 70, maxZoom: 16, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700 }); }
}
