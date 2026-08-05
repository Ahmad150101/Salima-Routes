export class Toasts {
  constructor(region) { this.region = region; }
  show(message, type = 'info') { const toast = document.createElement('div'); toast.className = `toast-item ${type}`; toast.setAttribute('role', type === 'error' ? 'alert' : 'status'); toast.textContent = message; this.region.append(toast); requestAnimationFrame(() => toast.classList.add('visible')); setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 250); }, 3800); }
}
