import { APP_CONFIG } from './config.js';
import { StorageManager } from './data/storage.js';
import { normalizeCustomer } from './data/migration.js';
import { importState, exportState, downloadJson } from './data/import-export.js';
import { upsertCustomer, removeCustomer } from './data/customer-store.js';
import { validCoordinates, validateCustomerName } from './utils/validation.js';
import { OsrmProvider } from './routing/osrm-provider.js';
import { MapManager } from './map/map-manager.js';
import { MarkerManager } from './map/marker-manager.js';
import { RouteRenderer } from './map/route-renderer.js';
import { Toasts } from './ui/toasts.js';
import { Dialogs } from './ui/dialogs.js';
import { CustomerList } from './ui/customer-list.js';
import { RouteResults } from './ui/route-results.js';

const storage = new StorageManager();
let state = storage.load();
const selected = new Set();
const routing = new OsrmProvider();
const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
const toasts = new Toasts(elements.toastRegion);
const dialogs = new Dialogs(elements.confirmDialog);
let mapManager, markers, routeRenderer, pendingLocation = null, editingId = null, mapMode = 'normal', activeRoutes = [], routeCustomers = [], calculationInProgress = false;

const customerList = new CustomerList(elements.customerList, elements.selectedCount, elements.customerSearch, elements.customerFilters, { toggle: toggleCustomer, edit: editCustomer, delete: deleteCustomer });
const routeResults = new RouteResults(elements.routeCards, elements.routeDetails, { select: id => selectRoute(activeRoutes.find(route => route.id === id)) });

init();

async function init() {
  applyPreferences();
  bindEvents();
  syncSettings();
  renderAll();
  routeResults.empty();
  initMap();
  if (state.storageWarning) showStorageWarning();
  if (!state.uiPreferences.onboardingSeen) openOnboarding();
  checkRoutingHealth();
  registerServiceWorker();
}

function initMap() {
  if (!globalThis.maplibregl) { showMapError('تعذر تحميل MapLibre. تحقق من الاتصال ثم أعد المحاولة.'); return; }
  try {
    mapManager = new MapManager('map', state.uiPreferences, handleMapClick).init();
    mapManager.onReady = () => { elements.mapSkeleton.classList.add('hidden'); markers = new MarkerManager(mapManager.map, { isSelected: id => selected.has(id), toggle: toggleCustomer, edit: editCustomer, delete: deleteCustomer }); routeRenderer = new RouteRenderer(mapManager.map); renderMarkers(); };
    mapManager.map.on('error', event => { if (!mapManager.loaded) showMapError('تعذر تحميل نمط الخريطة. تحقق من الاتصال بالإنترنت.'); if (event?.error) console.warn('Map style resource error:', event.error.message); });
  } catch { showMapError('تعذر بدء الخريطة في هذا المتصفح.'); }
}

function bindEvents() {
  elements.gpsCustomerBtn.addEventListener('click', () => locate('customer'));
  elements.gpsWarehouseBtn.addEventListener('click', () => locate('warehouse'));
  elements.pickCustomerBtn.addEventListener('click', () => setMapMode(mapMode === 'customer' ? 'normal' : 'customer'));
  elements.pickWarehouseBtn.addEventListener('click', () => setMapMode(mapMode === 'warehouse' ? 'normal' : 'warehouse'));
  elements.applyCoordsBtn.addEventListener('click', applyManualCoordinates);
  elements.clearPendingBtn.addEventListener('click', clearPending);
  elements.saveCustomerBtn.addEventListener('click', saveCustomer);
  elements.cancelEditBtn.addEventListener('click', resetForm);
  elements.selectAllBtn.addEventListener('click', () => { state.customers.filter(customer => customer.hasOrder).forEach(customer => selected.add(customer.id)); renderAll(); });
  elements.clearSelectionBtn.addEventListener('click', () => { selected.clear(); renderAll(); });
  elements.deleteSelectedBtn.addEventListener('click', deleteSelected);
  elements.optimizeBtn.addEventListener('click', calculateRoutes);
  elements.clearRouteBtn.addEventListener('click', clearRoute);
  elements.fitCustomersBtn.addEventListener('click', fitCustomers);
  elements.fitRouteBtn.addEventListener('click', () => routeRenderer?.fit());
  elements.styleSwitcher.addEventListener('click', event => { const button = event.target.closest('[data-style]'); if (button) setMapStyle(button.dataset.style); });
  elements.themeBtn.addEventListener('click', toggleTheme);
  elements.helpBtn.addEventListener('click', () => elements.helpDialog.showModal());
  elements.closeHelpBtn.addEventListener('click', () => elements.helpDialog.close());
  elements.panelHandle.addEventListener('click', togglePanel);
  elements.startBtn.addEventListener('click', closeOnboarding);
  elements.demoBtn.addEventListener('click', loadDemoData);
  elements.exportBtn.addEventListener('click', exportData);
  elements.importInput.addEventListener('change', importData);
  elements.deleteAllBtn.addEventListener('click', deleteAllData);
  elements.consumptionInput.addEventListener('change', saveVehicleSettings);
  elements.fuelPriceInput.addEventListener('change', saveVehicleSettings);
  elements.returnWarehouse.addEventListener('change', saveVehicleSettings);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { setMapMode('normal'); if (elements.onboarding.classList.contains('hidden') === false) closeOnboarding(); } });
}

function handleMapClick(location) {
  if (mapMode === 'customer') { setPending(location); toasts.show('تم تحديد موقع الزبون. يمكنك تغييره بالنقر مرة أخرى.'); }
  if (mapMode === 'warehouse') { setWarehouse(location); setMapMode('normal'); toasts.show('تم تحديد المستودع.'); }
}

function setMapMode(mode) {
  mapMode = mode;
  elements.mapMode.textContent = mode === 'customer' ? 'انقر لتحديد موقع الزبون' : mode === 'warehouse' ? 'انقر لتحديد المستودع' : 'الوضع العادي';
  elements.mapMode.classList.toggle('active', mode !== 'normal');
  elements.pickCustomerBtn.classList.toggle('active', mode === 'customer');
  elements.pickWarehouseBtn.classList.toggle('active', mode === 'warehouse');
}

function locate(target) {
  if (!navigator.geolocation) { toasts.show('المتصفح لا يدعم GPS.', 'error'); return; }
  const button = target === 'customer' ? elements.gpsCustomerBtn : elements.gpsWarehouseBtn;
  setButtonLoading(button, true, 'جاري تحديد الموقع…');
  navigator.geolocation.getCurrentPosition(position => {
    const { latitude, longitude, accuracy } = position.coords;
    if (!validCoordinates(latitude, longitude)) { toasts.show('أعاد GPS إحداثيات غير صالحة.', 'error'); return; }
    const location = { latitude, longitude, accuracy, source: 'current-location' };
    if (target === 'customer') setPending(location); else setWarehouse(location);
    mapManager?.map.easeTo({ center: [longitude, latitude], zoom: 16, duration: reducedMotion() ? 0 : 650 });
    if (accuracy > APP_CONFIG.poorAccuracyMeters) toasts.show(`دقة GPS ضعيفة (±${Math.round(accuracy)}م). يمكنك تصحيح الموقع على الخريطة.`, 'warning');
    setButtonLoading(button, false);
  }, error => {
    const message = error.code === 1 ? 'تم رفض صلاحية الموقع. اختر الموقع من الخريطة.' : error.code === 3 ? 'انتهت مهلة GPS. حاول في مكان مفتوح.' : 'تعذر الوصول إلى GPS.';
    toasts.show(message, 'error'); setButtonLoading(button, false);
  }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 });
}

function applyManualCoordinates() {
  const latitude = Number(elements.manualLat.value), longitude = Number(elements.manualLng.value);
  if (!validCoordinates(latitude, longitude)) { toasts.show('أدخل إحداثيات صالحة.', 'error'); return; }
  setPending({ latitude, longitude, accuracy: null, source: 'manual' });
  mapManager?.map.easeTo({ center: [longitude, latitude], zoom: 16, duration: reducedMotion() ? 0 : 650 });
}

function setPending(location) {
  pendingLocation = { ...location, latitude: Number(location.latitude), longitude: Number(location.longitude) };
  elements.latValue.textContent = pendingLocation.latitude.toFixed(6);
  elements.lngValue.textContent = pendingLocation.longitude.toFixed(6);
  elements.accuracyValue.textContent = Number.isFinite(pendingLocation.accuracy) ? `±${Math.round(pendingLocation.accuracy)} م` : 'يدوي/خريطة';
  elements.locationStatus.textContent = 'الموقع جاهز';
  elements.locationStatus.classList.add('success');
  elements.clearPendingBtn.classList.remove('hidden');
  const marker = markers?.setPending(pendingLocation);
  marker?.on('dragend', () => { const point = marker.getLngLat(); setPending({ latitude: point.lat, longitude: point.lng, source: 'map-click', accuracy: null }); });
}

function clearPending() { pendingLocation = null; markers?.setPending(null); elements.latValue.textContent = elements.lngValue.textContent = elements.accuracyValue.textContent = '—'; elements.locationStatus.textContent = 'لم يحدد موقع'; elements.locationStatus.classList.remove('success'); elements.clearPendingBtn.classList.add('hidden'); }

function saveCustomer() {
  const validation = validateCustomerName(elements.customerName.value, state.customers, editingId);
  if (!validation.valid) { toasts.show(validation.error, validation.duplicate ? 'warning' : 'error'); elements.customerName.focus(); return; }
  if (!pendingLocation || !validCoordinates(pendingLocation.latitude, pendingLocation.longitude)) { toasts.show('حدد موقع الزبون أولاً.', 'error'); return; }
  const previous = state.customers.find(customer => customer.id === editingId);
  const result = upsertCustomer(state.customers, { ...pendingLocation, name: validation.value, hasOrder: elements.hasOrder.checked }, editingId);
  const customer = result.customer; state.customers = result.customers;
  selected.add(customer.id); saveState(); resetForm(); renderAll(customer.id); toasts.show(previous ? 'تم تحديث بيانات الزبون.' : 'تم حفظ الزبون بنجاح.', 'success');
}

function editCustomer(id) { const customer = state.customers.find(item => item.id === id); if (!customer) return; editingId = id; elements.formTitle.textContent = 'تعديل الزبون'; elements.customerName.value = customer.name; elements.hasOrder.checked = customer.hasOrder; elements.saveCustomerBtn.textContent = 'حفظ التعديلات'; elements.cancelEditBtn.classList.remove('hidden'); setPending(customer); elements.controlPanel.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); }
function resetForm() { editingId = null; elements.formTitle.textContent = 'إضافة زبون'; elements.customerName.value = ''; elements.hasOrder.checked = true; elements.manualLat.value = elements.manualLng.value = ''; elements.saveCustomerBtn.textContent = 'حفظ الزبون'; elements.cancelEditBtn.classList.add('hidden'); clearPending(); setMapMode('normal'); }
function toggleCustomer(id) { selected.has(id) ? selected.delete(id) : selected.add(id); renderAll(); }
async function deleteCustomer(id) { const customer = state.customers.find(item => item.id === id); if (!customer || !await dialogs.confirm({ title: 'حذف الزبون؟', message: `سيتم حذف ${customer.name} من هذا الجهاز.`, confirmLabel: 'حذف', danger: true })) return; state.customers = removeCustomer(state.customers, id); selected.delete(id); saveState(); renderAll(); clearRoute(); toasts.show('تم حذف الزبون.'); }
async function deleteSelected() { if (!selected.size) return toasts.show('لا يوجد زبائن محددون.', 'warning'); if (!await dialogs.confirm({ title: 'حذف الزبائن المحددين؟', message: `سيتم حذف ${selected.size} زبوناً من هذا الجهاز.`, confirmLabel: 'حذف المحدد', danger: true })) return; state.customers = state.customers.filter(customer => !selected.has(customer.id)); selected.clear(); saveState(); renderAll(); clearRoute(); }

function setWarehouse(location) { state.warehouse = { latitude: Number(location.latitude), longitude: Number(location.longitude), accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null, source: location.source || 'map-click', updatedAt: new Date().toISOString() }; saveState(); renderAll(); }

async function calculateRoutes() {
  if (calculationInProgress) return;
  if (!state.warehouse) return toasts.show('حدد المستودع أولاً.', 'error');
  routeCustomers = state.customers.filter(customer => selected.has(customer.id));
  if (routeCustomers.length < 2) return toasts.show('حدد زبونين على الأقل.', 'error');
  if (routeCustomers.length > APP_CONFIG.maxCustomersPerRoute) return toasts.show('النسخة التجريبية تسمح حتى 20 زبوناً في العملية الواحدة.', 'error');
  calculationInProgress = true; setButtonLoading(elements.optimizeBtn, true, 'جاري حساب المسارات…'); routeResults.loading();
  try {
    const points = [state.warehouse, ...routeCustomers];
    const result = await routing.optimizeRoute(points, { consumption: state.vehicleSettings.consumptionPer100Km, returnToWarehouse: state.routePreferences.returnToWarehouse });
    activeRoutes = result.alternatives; routeResults.render(activeRoutes, Number(state.vehicleSettings.fuelPrice)); elements.engineBadge.textContent = result.fallback ? 'حساب تقديري' : 'طرق قيادة فعلية'; elements.engineBadge.classList.toggle('warning', result.fallback); await selectRoute(activeRoutes.find(route => route.id === 'balanced'));
    if (result.fallback) toasts.show('مسار تقديري مؤقت — خدمة الطرق غير متاحة.', 'warning');
  } catch { routeResults.empty(); toasts.show('تعذر حساب المسار حالياً. حاول لاحقاً.', 'error'); }
  finally { calculationInProgress = false; setButtonLoading(elements.optimizeBtn, false); }
}

async function selectRoute(route) {
  if (!route) return;
  routeResults.select(route, routeCustomers, state.warehouse); renderMarkers(null, route.order);
  const orderedPoints = route.order.map(index => index === 0 ? state.warehouse : routeCustomers[index - 1]);
  try { const realRoute = await routing.getRoute(orderedPoints); routeRenderer?.draw(realRoute.geometry, false); }
  catch { const geometry = { type: 'LineString', coordinates: orderedPoints.map(point => [point.longitude, point.latitude]) }; routeRenderer?.draw(geometry, true); elements.engineBadge.textContent = 'مسار تقديري'; toasts.show('مسار تقديري مؤقت — خدمة الطرق غير متاحة.', 'warning'); }
}

function clearRoute() { routing.abort(); activeRoutes = []; routeCustomers = []; routeRenderer?.clear(); routeResults.empty(); elements.engineBadge.textContent = 'لم يتم الحساب'; renderMarkers(); }
function fitCustomers() { const points = [...state.customers, ...(state.warehouse ? [state.warehouse] : [])]; mapManager?.fitPoints(points); }
function renderAll(addedId = null) { customerList.render(state.customers, selected); elements.warehouseSummary.textContent = state.warehouse ? `${state.warehouse.latitude.toFixed(6)}, ${state.warehouse.longitude.toFixed(6)} • جاهز` : 'لم تحدد نقطة البداية بعد.'; renderMarkers(addedId); }
function renderMarkers(addedId = null, order = []) { markers?.render(state.customers, state.warehouse, order, addedId); }

function syncSettings() { elements.consumptionInput.value = state.vehicleSettings.consumptionPer100Km; elements.fuelPriceInput.value = state.vehicleSettings.fuelPrice ?? ''; elements.returnWarehouse.checked = state.routePreferences.returnToWarehouse; }
function saveVehicleSettings() { const consumption = Number(elements.consumptionInput.value); state.vehicleSettings.consumptionPer100Km = Number.isFinite(consumption) && consumption > 0 ? consumption : 9.5; state.vehicleSettings.fuelPrice = Number(elements.fuelPriceInput.value) || null; state.routePreferences.returnToWarehouse = elements.returnWarehouse.checked; saveState(); syncSettings(); }
function saveState() { storage.save(state); }

function exportData() { downloadJson(exportState(state), `salima-routes-${new Date().toISOString().slice(0, 10)}.json`); toasts.show('تم تجهيز ملف التصدير.', 'success'); }
async function importData(event) { const [file] = event.target.files; try { const imported = await importState(file); if (!await dialogs.confirm({ title: 'استيراد البيانات؟', message: `سيتم استبدال العرض الحالي بملف يحتوي ${imported.customers.length} زبوناً. صدّر نسخة احتياطية أولاً إذا لزم.`, confirmLabel: 'استيراد' })) return; state = imported; selected.clear(); saveState(); syncSettings(); renderAll(); clearRoute(); toasts.show('تم استيراد البيانات بأمان.', 'success'); } catch (error) { toasts.show(error.message, 'error'); } finally { event.target.value = ''; } }
async function deleteAllData() { if (!await dialogs.confirm({ title: 'حذف جميع البيانات نهائياً؟', message: 'سيتم حذف الزبائن والمستودع والإعدادات المحلية. لا يمكن التراجع إلا من ملف تصدير.', confirmLabel: 'نعم، احذف الكل', danger: true })) return; storage.reset(); state = storage.load(); selected.clear(); syncSettings(); renderAll(); clearRoute(); resetForm(); toasts.show('تم حذف البيانات المحلية.'); }
function loadDemoData() { const base = Date.now(); state.customers = [['متجر تجريبي 1', 32.3117, 35.0272], ['متجر تجريبي 2', 32.3172, 35.0335], ['متجر تجريبي 3', 32.3057, 35.0390], ['متجر تجريبي 4', 32.3005, 35.0227]].map(([name, latitude, longitude], index) => normalizeCustomer({ id: `demo-${base}-${index}`, name, latitude, longitude, hasOrder: index !== 3, source: 'demo' })); state.warehouse = { latitude: 32.3104, longitude: 35.0285, source: 'demo', accuracy: null, updatedAt: new Date().toISOString() }; selected.clear(); state.customers.filter(customer => customer.hasOrder).forEach(customer => selected.add(customer.id)); saveState(); renderAll(); fitCustomers(); toasts.show('تم تحميل بيانات تجريبية فقط.', 'success'); }

function applyPreferences() { const systemDark = matchMedia('(prefers-color-scheme: dark)').matches; const theme = state.uiPreferences.theme || (systemDark ? 'dark' : 'light'); document.documentElement.dataset.theme = theme; elements.themeBtn?.setAttribute('aria-pressed', String(theme === 'dark')); }
function toggleTheme() { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; state.uiPreferences.theme = dark ? 'dark' : 'light'; elements.themeBtn.setAttribute('aria-pressed', String(dark)); if (dark) setMapStyle('dark'); else if (state.uiPreferences.mapStyle === 'dark') setMapStyle('liberty'); saveState(); }
function setMapStyle(style) { mapManager?.setStyle(style); state.uiPreferences.mapStyle = style; elements.styleSwitcher.querySelectorAll('[data-style]').forEach(button => button.classList.toggle('active', button.dataset.style === style)); saveState(); }
function togglePanel() { const collapsed = elements.controlPanel.classList.toggle('collapsed'); elements.panelHandle.setAttribute('aria-expanded', String(!collapsed)); setTimeout(() => mapManager?.map.resize(), 300); }
function openOnboarding() { elements.onboarding.classList.remove('hidden'); elements.startBtn.focus(); }
function closeOnboarding() { elements.onboarding.classList.add('hidden'); state.uiPreferences.onboardingSeen = true; saveState(); elements.customerName.focus(); }
async function showStorageWarning() { const download = await dialogs.confirm({ title: 'تعذر قراءة البيانات المحلية', message: 'احتفظ التطبيق بالنص التالف دون حذفه. هل تريد تنزيل نسخة منه قبل بدء بيانات جديدة؟', confirmLabel: 'تنزيل نسخة' }); if (download) storage.downloadCorruptBackup(); toasts.show('لم تُحذف البيانات التالفة تلقائياً.', 'warning'); }
async function checkRoutingHealth() { const healthy = await routing.healthCheck(); elements.serviceStatus.className = `service-status ${healthy ? 'online' : 'offline'}`; elements.serviceStatus.innerHTML = `<i></i>${healthy ? ' خدمة الطرق متصلة' : ' الوضع التقديري متاح'}`; }
function showMapError(message) { elements.mapSkeleton.classList.add('hidden'); elements.mapMessage.textContent = message; elements.mapMessage.classList.remove('hidden'); }
function setButtonLoading(button, loading, label) { if (loading) { button.dataset.label = button.textContent; button.textContent = label; button.classList.add('loading'); button.disabled = true; } else { button.textContent = button.dataset.label || button.textContent; button.classList.remove('loading'); button.disabled = false; } }
function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
function registerServiceWorker() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').then(registration => { registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) toasts.show('يتوفر تحديث جديد. أعد تحميل الصفحة لتطبيقه.', 'info'); }); }); }).catch(() => {}); }

export const testApi = { validateCustomerName, validCoordinates, normalizeCustomer };
