export const formatDistance = meters => `${(Number(meters) / 1000).toFixed(1)} كم`;
export const formatDuration = seconds => `${Math.max(1, Math.round(Number(seconds) / 60))} دقيقة`;
export const formatDate = iso => { try { return new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(new Date(iso)); } catch { return 'غير معروف'; } };
export function debounce(fn, wait = 180) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }
export function uid() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
