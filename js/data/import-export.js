import { APP_CONFIG } from '../config.js';
import { migrateState } from './migration.js';
import { assertSafeObject } from '../utils/validation.js';

export async function importState(file) {
  if (!file || file.size > APP_CONFIG.maxImportBytes) throw new Error('حجم ملف الاستيراد أكبر من 1MB.');
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('ملف JSON غير صالح.'); }
  assertSafeObject(parsed);
  if (!parsed || (!Array.isArray(parsed.customers) && !Array.isArray(parsed))) throw new Error('لا يحتوي الملف قائمة زبائن صالحة.');
  return migrateState(parsed);
}

export function exportState(state) { return JSON.stringify({ app: 'Salima Routes', exportedAt: new Date().toISOString(), ...state }, null, 2); }
export function downloadJson(contents, filename) { const blob = new Blob([contents], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }
