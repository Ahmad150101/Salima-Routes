import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineMeters, estimateFuelLiters } from '../js/utils/geo.js';
import { fallbackMatrix, nearestNeighbor, twoOpt, routeCost, optimizeOrder, buildAlternatives } from '../js/routing/local-optimizer.js';
import { OsrmProvider } from '../js/routing/osrm-provider.js';

const points = [{ latitude: 32.31, longitude: 35.03 }, { latitude: 32.32, longitude: 35.04 }, { latitude: 32.30, longitude: 35.02 }, { latitude: 32.305, longitude: 35.045 }];
test('calculates Haversine and documented fuel formula', () => { assert.ok(haversineMeters(points[0], points[1]) > 0); assert.equal(estimateFuelLiters(100_000, 10), 10); });
test('nearest neighbor supports return and open routes', () => { const matrix = fallbackMatrix(points); const closed = nearestNeighbor(matrix.distances, true), open = nearestNeighbor(matrix.distances, false); assert.equal(closed[0], 0); assert.equal(closed.at(-1), 0); assert.notEqual(open.at(-1), 0); assert.equal(new Set(closed.slice(1, -1)).size, 3); });
test('2-opt never worsens a route', () => { const costs = [[0,1,9,2],[1,0,2,9],[9,2,0,1],[2,9,1,0]], route = [0,2,1,3,0], improved = twoOpt(route, costs); assert.ok(routeCost(improved, costs) <= routeCost(route, costs)); });
test('builds three route choices', () => { const matrix = fallbackMatrix(points), routes = buildAlternatives(matrix, 9.5, true); assert.deepEqual(routes.map(route => route.id), ['fastest','shortest','balanced']); assert.ok(routes.every(route => route.metrics.distance > 0)); assert.equal(optimizeOrder(matrix, 'distance', false)[0], 0); });
test('routing provider returns real matrix and caches it', async () => { let calls = 0; const fetcher = async () => { calls += 1; return { ok: true, json: async () => ({ code: 'Ok', distances: [[0,1],[1,0]], durations: [[0,2],[2,0]] }) }; }; const provider = new OsrmProvider(fetcher); const pair = points.slice(0,2); assert.equal((await provider.getMatrix(pair)).source, 'osrm'); await provider.getMatrix(pair); assert.equal(calls, 1); });
test('network failure activates routing fallback', async () => { const provider = new OsrmProvider(async () => { throw new TypeError('network'); }); const result = await provider.optimizeRoute(points, { consumption: 9.5, returnToWarehouse: true }); assert.equal(result.fallback, true); assert.equal(result.alternatives.length, 3); });
