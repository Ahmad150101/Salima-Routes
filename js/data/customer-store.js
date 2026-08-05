import { normalizeCustomer } from './migration.js';
import { uid } from '../utils/format.js';
import { validateCustomerName, validCoordinates } from '../utils/validation.js';

export function upsertCustomer(customers, input, editingId = null) {
  const name = validateCustomerName(input.name, customers, editingId);
  if (!name.valid) throw new Error(name.error);
  if (!validCoordinates(input.latitude, input.longitude)) throw new Error('إحداثيات الزبون غير صالحة.');
  const existing = customers.find(customer => customer.id === editingId), timestamp = new Date().toISOString();
  const customer = normalizeCustomer({ ...existing, ...input, id: existing?.id || uid(), name: name.value, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp });
  return { customer, customers: existing ? customers.map(item => item.id === editingId ? customer : item) : [...customers, customer] };
}
export function removeCustomer(customers, id) { return customers.filter(customer => customer.id !== id); }
