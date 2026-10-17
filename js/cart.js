// Carrito del cliente (localStorage) y contexto de mesa (sessionStorage).
const KEY = 'kiosko.cart.v1', MESA = 'kiosko.mesa.v1', MIS = 'kiosko.pedidos.v1';
const subs = new Set();
const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

export const cart = {
  items: leer(KEY, []),
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.items)); } catch { /* ignora */ } subs.forEach(f => f(this)); },
  add(p, variante = '', cantidad = 1, nota = '') {
    const key = p.id + '|' + variante + '|' + nota;
    const ex = this.items.find(i => i.key === key);
    const precio = variante ? ((p.variantes || []).find(v => v.nombre === variante)?.precio ?? p.precio) : p.precio;
    if (ex) ex.cantidad = Math.min(99, ex.cantidad + cantidad);
    else this.items.push({ key, productoId: p.id, nombre: p.nombre, variante, precio: Number(precio) || 0, cantidad, nota });
    this._save();
  },
  setQty(key, q) {
    const it = this.items.find(i => i.key === key); if (!it) return;
    if (q <= 0) this.items = this.items.filter(i => i.key !== key); else it.cantidad = Math.min(99, q);
    this._save();
  },
  clear() { this.items = []; this._save(); },
  count() { return this.items.reduce((a, i) => a + i.cantidad, 0); },
  subtotal() { return this.items.reduce((a, i) => a + i.cantidad * i.precio, 0); }
};

export const getMesa = () => { try { return JSON.parse(sessionStorage.getItem(MESA)); } catch { return null; } };
export const setMesa = m => { try { sessionStorage.setItem(MESA, JSON.stringify(m)); } catch { /* ignora */ } };
export const clearMesa = () => { try { sessionStorage.removeItem(MESA); } catch { /* ignora */ } };

export const misPedidosIds = () => leer(MIS, []);
export function guardarPedidoId(id) {
  const l = [id, ...misPedidosIds().filter(x => x !== id)].slice(0, 30);
  try { localStorage.setItem(MIS, JSON.stringify(l)); } catch { /* ignora */ }
}
