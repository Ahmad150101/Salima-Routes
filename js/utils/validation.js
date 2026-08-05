const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function validateCustomerName(value, customers = [], editingId = null) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { valid: false, error: 'اكتب اسم الزبون أولاً.' };
  if (name.length < 2 || name.length > 80) return { valid: false, error: 'اسم الزبون يجب أن يكون بين حرفين و80 حرفاً.' };
  if (/[<>]/.test(name)) return { valid: false, error: 'اسم الزبون يحتوي رموزاً غير مسموحة.' };
  const duplicate = customers.some(customer => customer.id !== editingId && customer.name.localeCompare(name, 'ar', { sensitivity: 'base' }) === 0);
  return duplicate ? { valid: false, duplicate: true, error: 'يوجد زبون بالاسم نفسه. اختر اسماً أوضح.' } : { valid: true, value: name };
}

export function validCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function assertSafeObject(value, depth = 0) {
  if (depth > 12) throw new Error('بنية الملف متداخلة أكثر من اللازم.');
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error('يحتوي الملف على بنية غير آمنة.');
    assertSafeObject(value[key], depth + 1);
  }
}
