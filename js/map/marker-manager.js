import { formatDate } from '../utils/format.js';

const text = (tag, value, className) => { const element = document.createElement(tag); if (className) element.className = className; element.textContent = value; return element; };
const warehouseIcon = () => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', 'M3 9 12 4l9 5v11H3V9Zm4 3h10M7 16h3m4 0h3'); svg.append(path); return svg; };

export class MarkerManager {
  constructor(map, handlers) { this.map = map; this.handlers = handlers; this.markers = new Map(); }

  #basicElement(label, type) { const element = document.createElement('button'); element.type = 'button'; element.className = `map-marker ${type}`; element.setAttribute('aria-label', label); const content = document.createElement('span'); content.append(type === 'warehouse' ? warehouseIcon() : document.createTextNode(label)); element.append(content); return element; }

  #customerElement(customer) {
    const element = document.createElement('button'); element.type = 'button'; element.className = 'customer-map-marker'; element.dir = 'rtl';
    const pin = document.createElement('span'); pin.className = 'customer-marker-pin'; pin.setAttribute('aria-hidden', 'true');
    const badge = document.createElement('span'); badge.className = 'route-order-badge hidden'; pin.append(badge);
    const label = document.createElement('span'); label.className = 'customer-marker-label';
    element.append(pin, label);
    return { element, label, badge };
  }

  #updateCustomerRecord(record, customer, rank, namesVisible, added) {
    const selected = this.handlers.isSelected(customer.id);
    record.element.className = `customer-map-marker ${customer.hasOrder ? 'order' : 'customer'}${selected ? ' selected' : ''}${added ? ' marker-added' : ''}`;
    record.element.setAttribute('aria-label', `${customer.name}${rank ? `، ترتيب ${rank}` : ''}`);
    record.element.title = customer.name;
    record.label.textContent = customer.name;
    record.label.classList.toggle('hidden', !namesVisible);
    record.badge.textContent = rank ? String(rank) : '';
    record.badge.classList.toggle('hidden', !rank);
    record.marker.setLngLat([customer.longitude, customer.latitude]);
    const previousPopup = record.marker.getPopup();
    if (previousPopup?.isOpen()) previousPopup.remove();
    record.marker.setPopup(new maplibregl.Popup({ offset: 28, closeButton: true, maxWidth: '320px' }).setDOMContent(this.#popup(customer)));
  }

  #popup(customer) { const root = document.createElement('section'); root.className = 'customer-popup'; root.dir = 'rtl'; root.append(text('strong', customer.name), text('span', customer.hasOrder ? 'لديه طلبية' : 'بلا طلبية', `badge ${customer.hasOrder ? 'order' : ''}`), text('p', `${customer.latitude.toFixed(6)}, ${customer.longitude.toFixed(6)}`), text('p', `المصدر: ${customer.source}`), text('p', `سُجّل: ${formatDate(customer.createdAt)}`)); const actions = document.createElement('div'); actions.className = 'popup-actions'; for (const [label, action] of [[this.handlers.isSelected(customer.id) ? 'إلغاء التحديد' : 'تحديد', 'toggle'], ['تعديل', 'edit'], ['حذف', 'delete']]) { const button = text('button', label); button.type = 'button'; button.addEventListener('click', () => this.handlers[action](customer.id)); actions.append(button); } root.append(actions); return root; }

  render(customers, warehouse, routeOrder = [], addedId = null, namesVisible = true) {
    const ranks = new Map(); let deliveryRank = 0;
    for (const pointIndex of routeOrder) if (pointIndex !== 0 && !ranks.has(pointIndex)) ranks.set(pointIndex, ++deliveryRank);
    const activeIds = new Set(customers.map(customer => customer.id));
    for (const [id, record] of this.markers) if (!activeIds.has(id)) { record.marker.remove(); this.markers.delete(id); }
    customers.forEach((customer, index) => {
      let record = this.markers.get(customer.id);
      if (!record) { const dom = this.#customerElement(customer); const marker = new maplibregl.Marker({ element: dom.element, anchor: 'bottom-right' }).setLngLat([customer.longitude, customer.latitude]).addTo(this.map); record = { ...dom, marker }; this.markers.set(customer.id, record); }
      this.#updateCustomerRecord(record, customer, ranks.get(index + 1), namesVisible, customer.id === addedId);
    });
    if (warehouse) {
      if (!this.warehouseMarker) { const element = this.#basicElement('المستودع', 'warehouse'); this.warehouseMarker = new maplibregl.Marker({ element, anchor: 'bottom' }).setPopup(new maplibregl.Popup({ offset: 26 }).setDOMContent(text('strong', 'المستودع / نقطة البداية'))).addTo(this.map); }
      this.warehouseMarker.setLngLat([warehouse.longitude, warehouse.latitude]);
    } else { this.warehouseMarker?.remove(); this.warehouseMarker = null; }
  }

  setLabelsVisible(visible) { for (const record of this.markers.values()) record.label.classList.toggle('hidden', !visible); }
  setPending(point) { this.pendingMarker?.remove(); this.pendingMarker = point ? new maplibregl.Marker({ element: this.#basicElement('الموقع المؤقت', 'pending'), anchor: 'bottom', draggable: true }).setLngLat([point.longitude, point.latitude]).addTo(this.map) : null; return this.pendingMarker; }
  clear() { for (const record of this.markers.values()) record.marker.remove(); this.markers.clear(); this.warehouseMarker?.remove(); this.warehouseMarker = null; }
}
