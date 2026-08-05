export const APP_CONFIG = Object.freeze({
  schemaVersion: 3,
  storageKey: 'salima_routes_app_v3',
  legacyKeys: Object.freeze({ customers: 'salima_routes_customers_v1', warehouse: 'salima_routes_depot_v1', settings: 'salima_routes_settings_v1' }),
  defaultCenter: Object.freeze([35.030, 32.310]),
  maxCustomersPerRoute: 20,
  maxImportBytes: 1_000_000,
  poorAccuracyMeters: 100,
  osrmBaseUrl: 'https://router.project-osrm.org',
  requestTimeoutMs: 12_000,
  cacheTtlMs: 5 * 60_000,
  rtlPluginUrl: 'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js',
  styles: Object.freeze({
    liberty: Object.freeze({ label: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' }),
    positron: Object.freeze({ label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' }),
    dark: Object.freeze({ label: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark' })
  })
});
