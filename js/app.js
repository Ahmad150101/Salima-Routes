(function () {
  const STORAGE_KEY = 'salima_routes_customers_v1';
  const DEPOT_KEY = 'salima_routes_depot_v1';
  const SETTINGS_KEY = 'salima_routes_settings_v1';
  const DEFAULT_CENTER = [32.310, 35.030]; // Tulkarm area fallback

  const state = {
    customers: loadJSON(STORAGE_KEY, []),
    depot: loadJSON(DEPOT_KEY, null),
    pendingLocation: null,
    selectedIds: new Set(),
    mapMode: 'normal',
    markers: new Map(),
    depotMarker: null,
    pendingMarker: null,
    routeLayer: null,
    routeStopLayers: [],
    routeResults: [],
    activeRouteId: null
  };

  const els = {};
  const $ = id => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    Object.assign(els, {
      customerName: $('customerName'), locationStatus: $('locationStatus'), latValue: $('latValue'), lngValue: $('lngValue'), accuracyValue: $('accuracyValue'),
      currentLocationBtn: $('currentLocationBtn'), pickMapBtn: $('pickMapBtn'), saveCustomerBtn: $('saveCustomerBtn'),
      depotCurrentBtn: $('depotCurrentBtn'), depotMapBtn: $('depotMapBtn'), depotSummary: $('depotSummary'),
      customerList: $('customerList'), selectedCount: $('selectedCount'), selectAllBtn: $('selectAllBtn'), clearSelectionBtn: $('clearSelectionBtn'), deleteSelectedBtn: $('deleteSelectedBtn'),
      consumptionInput: $('consumptionInput'), returnDepot: $('returnDepot'), optimizeBtn: $('optimizeBtn'), routeCards: $('routeCards'), routeDetails: $('routeDetails'), routeTitle: $('routeTitle'), routeStops: $('routeStops'), routeEngineBadge: $('routeEngineBadge'), fitRouteBtn: $('fitRouteBtn'),
      mapModeText: $('mapModeText'), exportBtn: $('exportBtn'), importInput: $('importInput'), demoBtn: $('demoBtn'), toast: $('toast')
    });

    const settings = loadJSON(SETTINGS_KEY, { consumption: 9.5, returnDepot: true });
    els.consumptionInput.value = settings.consumption || 9.5;
    els.returnDepot.checked = settings.returnDepot !== false;

    initMap();
    bindEvents();
    renderCustomers();
    renderDepot();
    updateMapMarkers();
  }

  function initMap() {
    state.map = L.map('map', { zoomControl: true }).setView(DEFAULT_CENTER, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);

    state.map.on('click', (e) => {
      if (state.mapMode === 'pick-customer') {
        setPendingLocation({ lat: e.latlng.lat, lng: e.latlng.lng, accuracy: null, source: 'map' });
        setMapMode('normal');
        toast('تم تحديد موقع الزبون من الخريطة');
      } else if (state.mapMode === 'pick-depot') {
        setDepot({ lat: e.latlng.lat, lng: e.latlng.lng, accuracy: null, source: 'map' });
        setMapMode('normal');
        toast('تم تحديد نقطة الانطلاق');
      }
    });

    setTimeout(() => state.map.invalidateSize(), 200);
  }

  function bindEvents() {
    els.currentLocationBtn.addEventListener('click', () => getCurrentPosition('customer'));
    els.pickMapBtn.addEventListener('click', () => setMapMode(state.mapMode === 'pick-customer' ? 'normal' : 'pick-customer'));
    els.saveCustomerBtn.addEventListener('click', saveCustomer);
    els.customerName.addEventListener('keydown', e => { if (e.key === 'Enter') saveCustomer(); });

    els.depotCurrentBtn.addEventListener('click', () => getCurrentPosition('depot'));
    els.depotMapBtn.addEventListener('click', () => setMapMode(state.mapMode === 'pick-depot' ? 'normal' : 'pick-depot'));

    els.selectAllBtn.addEventListener('click', () => { state.customers.forEach(c => state.selectedIds.add(c.id)); renderCustomers(); });
    els.clearSelectionBtn.addEventListener('click', () => { state.selectedIds.clear(); renderCustomers(); });
    els.deleteSelectedBtn.addEventListener('click', deleteSelected);

    els.optimizeBtn.addEventListener('click', optimizeRoutes);
    els.fitRouteBtn.addEventListener('click', fitActiveRoute);
    els.consumptionInput.addEventListener('change', saveSettings);
    els.returnDepot.addEventListener('change', saveSettings);

    els.exportBtn.addEventListener('click', exportData);
    els.importInput.addEventListener('change', importData);
    els.demoBtn.addEventListener('click', loadDemoData);
  }

  function getCurrentPosition(target) {
    if (!navigator.geolocation) {
      toast('المتصفح لا يدعم تحديد الموقع', true);
      return;
    }
    const button = target === 'customer' ? els.currentLocationBtn : els.depotCurrentBtn;
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'جاري تحديد الموقع…';
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, source: 'gps' };
        if (target === 'customer') setPendingLocation(loc); else setDepot(loc);
        state.map.setView([loc.lat, loc.lng], 16);
        toast(target === 'customer' ? 'تم تحديد موقع الزبون الحالي' : 'تم اعتماد موقعك كنقطة انطلاق');
        button.disabled = false; button.textContent = oldText;
      },
      err => {
        button.disabled = false; button.textContent = oldText;
        const msg = err.code === 1 ? 'تم رفض صلاحية الموقع. يمكنك اختيار الموقع من الخريطة.' : 'تعذر تحديد الموقع. جرّب اختيار الموقع من الخريطة.';
        toast(msg, true);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function setPendingLocation(loc) {
    state.pendingLocation = loc;
    els.latValue.textContent = loc.lat.toFixed(6);
    els.lngValue.textContent = loc.lng.toFixed(6);
    els.accuracyValue.textContent = loc.accuracy ? `± ${Math.round(loc.accuracy)} م` : 'من الخريطة';
    els.locationStatus.textContent = 'تم تحديد الموقع';
    els.locationStatus.classList.add('ok');

    if (state.pendingMarker) state.map.removeLayer(state.pendingMarker);
    state.pendingMarker = L.circleMarker([loc.lat, loc.lng], { radius: 10, weight: 3, fillOpacity: .25 }).addTo(state.map)
      .bindTooltip('الموقع المختار مؤقتاً');
  }

  function saveCustomer() {
    const name = els.customerName.value.trim();
    if (!name) return toast('اكتب اسم الزبون أولاً', true);
    if (!state.pendingLocation) return toast('حدد موقع الزبون أولاً', true);

    const customer = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      name,
      lat: state.pendingLocation.lat,
      lng: state.pendingLocation.lng,
      accuracy: state.pendingLocation.accuracy,
      source: state.pendingLocation.source,
      createdAt: new Date().toISOString()
    };
    state.customers.push(customer);
    persistCustomers();
    state.selectedIds.add(customer.id);
    els.customerName.value = '';
    clearPendingLocation();
    renderCustomers();
    updateMapMarkers();
    toast(`تم حفظ ${name}`);
  }

  function clearPendingLocation() {
    state.pendingLocation = null;
    els.latValue.textContent = '—'; els.lngValue.textContent = '—'; els.accuracyValue.textContent = '—';
    els.locationStatus.textContent = 'لم يتم تحديد موقع'; els.locationStatus.classList.remove('ok');
    if (state.pendingMarker) { state.map.removeLayer(state.pendingMarker); state.pendingMarker = null; }
  }

  function setDepot(loc) {
    state.depot = { ...loc, updatedAt: new Date().toISOString() };
    localStorage.setItem(DEPOT_KEY, JSON.stringify(state.depot));
    renderDepot();
    updateDepotMarker();
  }

  function renderDepot() {
    if (!state.depot) { els.depotSummary.textContent = 'لم يتم تحديد نقطة انطلاق بعد.'; return; }
    const accuracy = state.depot.accuracy ? ` • دقة ±${Math.round(state.depot.accuracy)}م` : '';
    els.depotSummary.innerHTML = `<strong>نقطة البداية جاهزة</strong><br><span dir="ltr">${state.depot.lat.toFixed(6)}, ${state.depot.lng.toFixed(6)}</span>${accuracy}`;
  }

  function setMapMode(mode) {
    state.mapMode = mode;
    els.mapModeText.textContent = mode === 'pick-customer' ? 'انقر لتحديد موقع الزبون' : mode === 'pick-depot' ? 'انقر لتحديد نقطة الانطلاق' : 'الوضع العادي';
    state.map.getContainer().style.cursor = mode === 'normal' ? '' : 'crosshair';
    els.pickMapBtn.textContent = mode === 'pick-customer' ? 'إلغاء الاختيار' : '🗺️ اختيار من الخريطة';
    els.depotMapBtn.textContent = mode === 'pick-depot' ? 'إلغاء الاختيار' : 'حددها من الخريطة';
  }

  function renderCustomers() {
    els.customerList.innerHTML = '';
    if (!state.customers.length) {
      els.customerList.innerHTML = '<div class="empty-state">أضف أول زبون للبدء.</div>';
      els.selectedCount.textContent = '0 محدد';
      return;
    }

    state.customers.forEach((customer, index) => {
      const row = document.createElement('label');
      row.className = 'customer-row';
      row.innerHTML = `
        <input type="checkbox" ${state.selectedIds.has(customer.id) ? 'checked' : ''} />
        <div class="customer-info"><strong>${escapeHtml(customer.name)}</strong><span>${customer.lat.toFixed(5)}, ${customer.lng.toFixed(5)}</span></div>
        <span class="marker-pill">${index + 1}</span>`;
      const checkbox = row.querySelector('input');
      checkbox.addEventListener('change', () => {
        checkbox.checked ? state.selectedIds.add(customer.id) : state.selectedIds.delete(customer.id);
        updateSelectedCount();
      });
      row.querySelector('.customer-info').addEventListener('click', (e) => {
        e.preventDefault();
        state.map.setView([customer.lat, customer.lng], 17);
        const marker = state.markers.get(customer.id); if (marker) marker.openPopup();
      });
      els.customerList.appendChild(row);
    });
    updateSelectedCount();
  }

  function updateSelectedCount() { els.selectedCount.textContent = `${state.selectedIds.size} محدد`; }

  function deleteSelected() {
    if (!state.selectedIds.size) return toast('لا يوجد زبائن محددون للحذف', true);
    const count = state.selectedIds.size;
    state.customers = state.customers.filter(c => !state.selectedIds.has(c.id));
    state.selectedIds.clear();
    persistCustomers(); renderCustomers(); updateMapMarkers(); clearRoute();
    toast(`تم حذف ${count} زبون/زبائن`);
  }

  function updateMapMarkers() {
    for (const marker of state.markers.values()) state.map.removeLayer(marker);
    state.markers.clear();
    state.customers.forEach((c, idx) => {
      const icon = L.divIcon({ className: 'custom-div-marker', html: `<div class="customer-map-marker"><span>${idx + 1}</span></div>`, iconSize: [32, 32], iconAnchor: [16, 28] });
      const marker = L.marker([c.lat, c.lng], { icon }).addTo(state.map).bindPopup(`<strong>${escapeHtml(c.name)}</strong><br><small>${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}</small>`);
      state.markers.set(c.id, marker);
    });
    updateDepotMarker();
  }

  function updateDepotMarker() {
    if (state.depotMarker) { state.map.removeLayer(state.depotMarker); state.depotMarker = null; }
    if (!state.depot) return;
    const icon = L.divIcon({ className: 'custom-div-marker', html: '<div class="depot-map-marker"><span>ب</span></div>', iconSize: [32, 32], iconAnchor: [16, 28] });
    state.depotMarker = L.marker([state.depot.lat, state.depot.lng], { icon }).addTo(state.map).bindPopup('<strong>نقطة الانطلاق</strong>');
  }

  async function optimizeRoutes() {
    if (!state.depot) return toast('حدد نقطة الانطلاق أولاً', true);
    const selected = state.customers.filter(c => state.selectedIds.has(c.id));
    if (selected.length < 2) return toast('حدد زبونين على الأقل للمقارنة', true);
    if (selected.length > 24) return toast('نسخة الاختبار الحالية تسمح حتى 24 زبوناً في الحساب الواحد', true);

    const consumption = Number(els.consumptionInput.value);
    if (!Number.isFinite(consumption) || consumption <= 0) return toast('أدخل استهلاك سيارة صحيح', true);

    saveSettings();
    els.optimizeBtn.disabled = true;
    const oldText = els.optimizeBtn.textContent;
    els.optimizeBtn.textContent = 'جاري تحليل الطرق…';
    els.routeEngineBadge.textContent = 'جاري الاتصال بخدمة الطرق';
    clearRoute(false);

    const points = [{ id: 'depot', name: 'نقطة الانطلاق', lat: state.depot.lat, lng: state.depot.lng }, ...selected];
    try {
      const results = await SalimaRouting.computeRoutes(points, consumption, els.returnDepot.checked);
      state.routeResults = results.map(r => ({ ...r, points }));
      renderRouteCards();
      const source = results[0]?.matrixSource;
      els.routeEngineBadge.textContent = source === 'osrm' ? 'طرق فعلية • OSRM / OpenStreetMap' : 'وضع تقريبي • تعذر الوصول لخدمة الطرق';
      await selectRoute(results[0].id);
      toast('تم حساب المسارات بنجاح');
    } catch (err) {
      console.error(err);
      els.routeEngineBadge.textContent = 'فشل الحساب';
      toast('تعذر حساب المسارات. تأكد من اتصال الإنترنت ثم حاول مجدداً.', true);
    } finally {
      els.optimizeBtn.disabled = false;
      els.optimizeBtn.textContent = oldText;
    }
  }

  function renderRouteCards() {
    els.routeCards.innerHTML = '';
    const bestFuel = Math.min(...state.routeResults.map(r => r.metrics.fuel));
    state.routeResults.forEach(result => {
      const card = document.createElement('article');
      card.className = `route-card ${Math.abs(result.metrics.fuel - bestFuel) < 1e-6 ? 'recommended' : ''}`;
      card.dataset.routeId = result.id;
      card.innerHTML = `
        <h3>${result.title}</h3>
        <div class="route-stat-grid">
          <div class="route-stat"><span>المسافة</span><strong>${formatDistance(result.metrics.distance)}</strong></div>
          <div class="route-stat"><span>الوقت</span><strong>${formatDuration(result.metrics.duration)}</strong></div>
          <div class="route-stat"><span>الوقود التقديري</span><strong>${result.metrics.fuel.toFixed(2)} لتر</strong></div>
          <div class="route-stat"><span>عدد المحطات</span><strong>${result.points.length - 1}</strong></div>
        </div>
        <p class="route-note">${result.note}</p>`;
      card.addEventListener('click', () => selectRoute(result.id));
      els.routeCards.appendChild(card);
    });
  }

  async function selectRoute(routeId) {
    const result = state.routeResults.find(r => r.id === routeId);
    if (!result) return;
    state.activeRouteId = routeId;
    document.querySelectorAll('.route-card').forEach(c => c.classList.toggle('active', c.dataset.routeId === routeId));
    els.routeTitle.textContent = `تفاصيل: ${result.title}`;
    els.routeStops.innerHTML = '';

    result.order.forEach((idx, orderIndex) => {
      const p = result.points[idx];
      const li = document.createElement('li');
      li.innerHTML = `<strong>${escapeHtml(p.name)}</strong>${idx === 0 ? (orderIndex === 0 ? ' — البداية' : ' — العودة') : ''}`;
      els.routeStops.appendChild(li);
    });
    els.routeDetails.classList.remove('hidden');
    await drawRoute(result);
  }

  async function drawRoute(result) {
    clearMapRouteOnly();
    const orderedPoints = result.order.map(i => result.points[i]);
    try {
      const route = await SalimaRouting.fetchRouteGeometry(orderedPoints);
      state.routeLayer = L.geoJSON(route.geometry, { style: { weight: 6, opacity: .86 } }).addTo(state.map);
    } catch (err) {
      console.warn('Could not fetch route geometry; drawing straight fallback.', err);
      state.routeLayer = L.polyline(orderedPoints.map(p => [p.lat, p.lng]), { weight: 5, dashArray: '8 8', opacity: .75 }).addTo(state.map);
    }

    orderedPoints.forEach((p, idx) => {
      const cm = L.circleMarker([p.lat, p.lng], { radius: idx === 0 ? 9 : 7, weight: 3, fillOpacity: .9 }).addTo(state.map)
        .bindTooltip(idx === 0 ? 'البداية' : `${idx}. ${p.name}`, { permanent: idx > 0 && orderedPoints.length <= 10, direction: 'top' });
      state.routeStopLayers.push(cm);
    });
    fitActiveRoute();
  }

  function fitActiveRoute() {
    if (state.routeLayer) {
      const bounds = state.routeLayer.getBounds?.();
      if (bounds?.isValid?.()) state.map.fitBounds(bounds.pad(.12));
    }
  }

  function clearMapRouteOnly() {
    if (state.routeLayer) { state.map.removeLayer(state.routeLayer); state.routeLayer = null; }
    state.routeStopLayers.forEach(l => state.map.removeLayer(l));
    state.routeStopLayers = [];
  }

  function clearRoute(clearResults = true) {
    clearMapRouteOnly();
    if (clearResults) state.routeResults = [];
    state.activeRouteId = null;
    els.routeDetails.classList.add('hidden');
    if (clearResults) {
      els.routeCards.innerHTML = '<div class="result-empty"><div class="result-icon">↗</div><h3>المسارات ستظهر هنا</h3><p>حدد نقطة البداية، اختر زبونين على الأقل، ثم اضغط حساب أفضل المسارات.</p></div>';
      els.routeEngineBadge.textContent = 'لم يتم الحساب';
    }
  }

  function loadDemoData() {
    const demo = [
      ['محل تجريبي 1', 32.3117, 35.0272], ['محل تجريبي 2', 32.3172, 35.0335], ['محل تجريبي 3', 32.3057, 35.0390],
      ['محل تجريبي 4', 32.3005, 35.0227], ['محل تجريبي 5', 32.3220, 35.0194], ['محل تجريبي 6', 32.3090, 35.0452]
    ];
    state.customers = demo.map(([name, lat, lng], i) => ({ id: `demo-${Date.now()}-${i}`, name, lat, lng, accuracy: null, source: 'demo', createdAt: new Date().toISOString() }));
    state.selectedIds = new Set(state.customers.map(c => c.id));
    if (!state.depot) setDepot({ lat: 32.3104, lng: 35.0285, accuracy: null, source: 'demo' });
    persistCustomers(); renderCustomers(); updateMapMarkers();
    state.map.fitBounds(L.latLngBounds(state.customers.map(c => [c.lat, c.lng])).pad(.2));
    toast('تم تحميل بيانات تجريبية حول طولكرم');
  }

  function exportData() {
    const payload = {
      app: 'Salima Routes', version: 1, exportedAt: new Date().toISOString(),
      depot: state.depot, customers: state.customers,
      settings: { consumption: Number(els.consumptionInput.value), returnDepot: els.returnDepot.checked }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `salima-routes-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
    toast('تم تصدير البيانات');
  }

  async function importData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.customers)) throw new Error('Invalid customers');
      state.customers = data.customers.filter(c => c && c.name && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))).map(c => ({ ...c, lat: Number(c.lat), lng: Number(c.lng) }));
      state.depot = data.depot || null;
      state.selectedIds.clear();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customers));
      localStorage.setItem(DEPOT_KEY, JSON.stringify(state.depot));
      if (data.settings) {
        els.consumptionInput.value = data.settings.consumption || 9.5;
        els.returnDepot.checked = data.settings.returnDepot !== false;
        saveSettings();
      }
      renderCustomers(); renderDepot(); updateMapMarkers(); clearRoute();
      toast(`تم استيراد ${state.customers.length} زبون`);
    } catch (err) {
      console.error(err); toast('ملف الاستيراد غير صالح', true);
    } finally { e.target.value = ''; }
  }

  function persistCustomers() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customers)); }
  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ consumption: Number(els.consumptionInput.value), returnDepot: els.returnDepot.checked })); }
  function loadJSON(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }

  function formatDistance(meters) { return `${(meters / 1000).toFixed(meters >= 100000 ? 0 : 1)} كم`; }
  function formatDuration(seconds) {
    const mins = Math.round(seconds / 60); const h = Math.floor(mins / 60); const m = mins % 60;
    return h ? `${h}س ${m}د` : `${m} دقيقة`;
  }
  function escapeHtml(str) { return String(str).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
  let toastTimer;
  function toast(message, error = false) {
    clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.toggle('error', error); els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3200);
  }
})();
