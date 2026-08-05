/* Salima Routes - Routing helpers (test/MVP) */
(function (global) {
  const OSRM_BASE = 'https://router.project-osrm.org';

  function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (v) => v * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function fallbackMatrix(points) {
    const n = points.length;
    const distances = Array.from({ length: n }, () => Array(n).fill(0));
    const durations = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const air = haversineMeters(points[i], points[j]);
        const road = air * 1.28;
        distances[i][j] = road;
        durations[i][j] = road / (30_000 / 3600); // ~30 km/h fallback
      }
    }
    return { distances, durations, source: 'fallback' };
  }

  async function fetchMatrix(points) {
    const coordinates = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_BASE}/table/v1/driving/${coordinates}?annotations=distance,duration`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`OSRM matrix HTTP ${res.status}`);
      const data = await res.json();
      if (data.code !== 'Ok' || !data.distances || !data.durations) throw new Error(data.message || 'OSRM matrix failed');
      const hasUnreachable = data.distances.some(row => row.some(v => !Number.isFinite(v))) || data.durations.some(row => row.some(v => !Number.isFinite(v)));
      if (hasUnreachable) throw new Error('OSRM returned an unreachable point');
      return { distances: data.distances, durations: data.durations, source: 'osrm' };
    } finally {
      clearTimeout(timer);
    }
  }

  function maxOfMatrix(matrix) {
    let max = 1;
    for (const row of matrix) for (const v of row) if (Number.isFinite(v)) max = Math.max(max, v);
    return max;
  }

  function buildCostMatrix(distances, durations, mode, consumption) {
    const n = distances.length;
    const maxD = maxOfMatrix(distances);
    const maxT = maxOfMatrix(durations);
    const out = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const d = Number.isFinite(distances[i][j]) ? distances[i][j] : 1e12;
        const t = Number.isFinite(durations[i][j]) ? durations[i][j] : 1e12;
        if (i === j) { out[i][j] = 0; continue; }
        if (mode === 'distance') out[i][j] = d;
        else if (mode === 'duration') out[i][j] = t;
        else if (mode === 'balanced') out[i][j] = 0.58 * (d / maxD) + 0.42 * (t / maxT);
        else if (mode === 'fuel') out[i][j] = estimateFuelLiters(d, t, consumption);
      }
    }
    return out;
  }

  function nearestNeighbor(cost, returnDepot) {
    const n = cost.length;
    const unvisited = new Set();
    for (let i = 1; i < n; i++) unvisited.add(i);
    const route = [0];
    let current = 0;
    while (unvisited.size) {
      let best = null;
      let bestCost = Infinity;
      for (const candidate of unvisited) {
        if (cost[current][candidate] < bestCost) {
          bestCost = cost[current][candidate];
          best = candidate;
        }
      }
      route.push(best);
      unvisited.delete(best);
      current = best;
    }
    if (returnDepot) route.push(0);
    return route;
  }

  function routeCost(route, cost) {
    let total = 0;
    for (let i = 0; i < route.length - 1; i++) total += cost[route[i]][route[i + 1]];
    return total;
  }

  function twoOpt(route, cost, maxPasses = 12) {
    let best = route.slice();
    let bestValue = routeCost(best, cost);
    let improved = true;
    let pass = 0;
    const finalIsDepot = best.length > 2 && best[best.length - 1] === 0;
    const endExclusive = finalIsDepot ? best.length - 1 : best.length;

    while (improved && pass++ < maxPasses) {
      improved = false;
      for (let i = 1; i < endExclusive - 1; i++) {
        for (let k = i + 1; k < endExclusive; k++) {
          const candidate = best.slice();
          candidate.splice(i, k - i + 1, ...candidate.slice(i, k + 1).reverse());
          const value = routeCost(candidate, cost);
          if (value + 1e-9 < bestValue) {
            best = candidate;
            bestValue = value;
            improved = true;
          }
        }
      }
    }
    return best;
  }

  function optimizeOrder(distances, durations, mode, consumption, returnDepot) {
    const cost = buildCostMatrix(distances, durations, mode, consumption);
    return twoOpt(nearestNeighbor(cost, returnDepot), cost);
  }

  function routeMetrics(order, distances, durations, consumption) {
    let distance = 0;
    let duration = 0;
    let fuel = 0;
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i], b = order[i + 1];
      const d = distances[a][b] || 0;
      const t = durations[a][b] || 0;
      distance += d;
      duration += t;
      fuel += estimateFuelLiters(d, t, consumption);
    }
    return { distance, duration, fuel };
  }

  function estimateFuelLiters(distanceMeters, durationSeconds, consumptionPer100Km) {
    if (!distanceMeters) return 0;
    const km = distanceMeters / 1000;
    const hours = Math.max(durationSeconds / 3600, 1 / 3600);
    const avgSpeed = km / hours;
    let factor = 1;
    if (avgSpeed < 15) factor = 1.22;
    else if (avgSpeed < 25) factor = 1.14;
    else if (avgSpeed < 35) factor = 1.07;
    else if (avgSpeed > 90) factor = 1.06;
    return km * (consumptionPer100Km / 100) * factor;
  }

  async function fetchRouteGeometry(pointsInOrder) {
    const coordinates = pointsInOrder.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_BASE}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`OSRM route HTTP ${res.status}`);
      const data = await res.json();
      if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error(data.message || 'OSRM route failed');
      return data.routes[0];
    } finally {
      clearTimeout(timer);
    }
  }

  async function computeRoutes(points, consumption, returnDepot) {
    let matrix;
    try {
      matrix = await fetchMatrix(points);
    } catch (err) {
      console.warn('OSRM matrix unavailable, using fallback:', err);
      matrix = fallbackMatrix(points);
    }

    const configs = [
      { id: 'fuel', title: 'الأوفر وقوداً', mode: 'fuel', note: 'تقدير يعتمد على المسافة ومتوسط سرعة الطريق واستهلاك السيارة.' },
      { id: 'time', title: 'الأسرع', mode: 'duration', note: 'يركز على أقل زمن قيادة تقديري حسب بيانات الطرق.' },
      { id: 'balanced', title: 'المتوازن', mode: 'balanced', note: 'موازنة بين الزمن والمسافة عندما لا تريد التضحية بأحدهما بالكامل.' }
    ];

    const results = configs.map(cfg => {
      const order = optimizeOrder(matrix.distances, matrix.durations, cfg.mode, consumption, returnDepot);
      const metrics = routeMetrics(order, matrix.distances, matrix.durations, consumption);
      return { ...cfg, order, metrics, matrixSource: matrix.source };
    });

    // Avoid visually identical alternatives: try shortest distance if balanced duplicates another route.
    const routeKey = r => r.order.join('-');
    if (new Set(results.map(routeKey)).size < 3) {
      const distanceOrder = optimizeOrder(matrix.distances, matrix.durations, 'distance', consumption, returnDepot);
      const existing = new Set(results.map(routeKey));
      const key = distanceOrder.join('-');
      if (!existing.has(key)) {
        results[2] = {
          id: 'distance', title: 'الأقصر مسافة', mode: 'distance',
          note: 'يركز على أقل عدد كيلومترات إجمالي.', order: distanceOrder,
          metrics: routeMetrics(distanceOrder, matrix.distances, matrix.durations, consumption),
          matrixSource: matrix.source
        };
      }
    }

    return results;
  }

  global.SalimaRouting = {
    computeRoutes,
    fetchRouteGeometry,
    fallbackMatrix,
    haversineMeters,
    estimateFuelLiters,
    optimizeOrder,
    routeMetrics
  };
})(window);
