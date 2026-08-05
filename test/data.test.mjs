import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomerName, validCoordinates } from '../js/utils/validation.js';
import { migrateState } from '../js/data/migration.js';
import { StorageManager } from '../js/data/storage.js';
import { importState, exportState } from '../js/data/import-export.js';
import { upsertCustomer, removeCustomer } from '../js/data/customer-store.js';

const point = { name: 'متجر تجريبي', latitude: 32.31, longitude: 35.03, source: 'map-click', hasOrder: true };
class MemoryStorage { constructor(data = {}) { this.data = new Map(Object.entries(data)); } getItem(key) { return this.data.get(key) ?? null; } setItem(key, value) { this.data.set(key, value); } removeItem(key) { this.data.delete(key); } }

test('validates customer name and coordinates', () => { assert.equal(validateCustomerName(' ').valid, false); assert.equal(validateCustomerName('<script>').valid, false); assert.equal(validateCustomerName('متجر آمن').valid, true); assert.equal(validCoordinates(32.3, 35), true); assert.equal(validCoordinates(100, 35), false); });
test('adds, edits and deletes a customer', () => { const added = upsertCustomer([], point); assert.equal(added.customers.length, 1); const edited = upsertCustomer(added.customers, { ...point, name: 'متجر معدل' }, added.customer.id); assert.equal(edited.customers[0].name, 'متجر معدل'); assert.equal(edited.customer.id, added.customer.id); assert.equal(removeCustomer(edited.customers, added.customer.id).length, 0); });
test('rejects duplicate customer name', () => { const added = upsertCustomer([], point); assert.throws(() => upsertCustomer(added.customers, { ...point, longitude: 35.04 }), /يوجد زبون/); });
test('migrates legacy data without deleting identity', () => { const state = migrateState({ customers: [{ id: 'old-1', name: 'قديم', lat: '32.3', lng: '35', source: 'gps' }], depot: { lat: 32.2, lng: 35.1 }, settings: { consumptionPer100Km: 8 } }); assert.equal(state.schemaVersion, 3); assert.equal(state.customers[0].id, 'old-1'); assert.equal(state.customers[0].source, 'current-location'); assert.equal(state.warehouse.latitude, 32.2); });
test('shows customer names by default and persists the preference', () => { const memory = new MemoryStorage(); const manager = new StorageManager(memory); const state = migrateState({}); assert.equal(state.uiPreferences.customerNamesVisible, true); state.uiPreferences.customerNamesVisible = false; manager.save(state); assert.equal(manager.load().uiPreferences.customerNamesVisible, false); });
test('persists and reloads local state', () => { const memory = new MemoryStorage(); const manager = new StorageManager(memory); const state = migrateState({ customers: [point] }); manager.save(state); assert.equal(manager.load().customers[0].name, point.name); });
test('keeps corrupt storage available for backup', () => { const memory = new MemoryStorage({ salima_routes_app_v3: '{bad' }); const manager = new StorageManager(memory); const state = manager.load(); assert.equal(state.storageWarning, true); assert.equal(manager.corruptBackup, '{bad'); });
test('imports and exports safe JSON', async () => { const file = { size: 100, text: async () => JSON.stringify({ customers: [point] }) }; const imported = await importState(file); assert.equal(imported.customers.length, 1); assert.match(exportState(imported), /متجر تجريبي/); });
test('rejects invalid, oversized and polluted imports', async () => { await assert.rejects(importState({ size: 10, text: async () => '{bad' }), /غير صالح/); await assert.rejects(importState({ size: 1_000_001, text: async () => '{}' }), /أكبر/); await assert.rejects(importState({ size: 100, text: async () => '{"customers":[],"constructor":{"x":1}}' }), /غير آمنة/); });
