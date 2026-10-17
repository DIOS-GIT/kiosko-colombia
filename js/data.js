// Datos compartidos: carta, mesas y cálculo de totales.
import { db, collection, onSnapshot, getDocs } from './fb.js';
import { S } from './session.js';

export const ESTADOS = {
  pendiente_confirmacion: 'Por confirmar',
  confirmado: 'Confirmado',
  preparando: 'Preparando',
  listo: 'Listo',
  entregado: 'Entregado',
  cobrado: 'Cobrado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
  cancelado: 'Cancelado'
};
export const ESTADOS_ACTIVOS = ['pendiente_confirmacion', 'confirmado', 'preparando', 'listo', 'entregado'];
export const ORIGEN = { mesa: 'En mesa', recoger: 'Para recoger', domicilio: 'Domicilio' };
export const PAGOS = { efectivo: 'Efectivo', electronico: 'Electrónico', contraentrega: 'Contraentrega' };
export const ETIQUETAS = ['picante', 'vegano', 'sin gluten', 'nuevo', 'recomendado'];

export const cache = { productos: [], categorias: [], mesas: [] };
const subs = new Set();
export function onCache(fn) { subs.add(fn); return () => subs.delete(fn); }
const notify = () => subs.forEach(f => { try { f(cache); } catch (e) { console.error(e); } });

const mapDocs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
const porOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre).localeCompare(String(b.nombre));

// --- Carta pública: lectura única con caché de 5 min (ahorra lecturas del plan gratis) ---
const CLAVE = 'kiosko.carta.v1';
export async function cargarCartaPublica(force = false) {
  if (!force) {
    try {
      const c = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
      if (c && c.productos?.length && Date.now() - c.t < 5 * 60 * 1000) {
        cache.categorias = c.categorias; cache.productos = c.productos; notify(); return;
      }
    } catch { /* ignora */ }
  }
  const [cs, ps] = await Promise.all([getDocs(collection(db, 'categorias')), getDocs(collection(db, 'productos'))]);
  const limpiar = o => JSON.parse(JSON.stringify(o, (k, v) => (v && typeof v === 'object' && 'seconds' in v && 'nanoseconds' in v) ? undefined : v));
  cache.categorias = limpiar(mapDocs(cs)).filter(c => c.activa !== false).sort(porOrden);
  cache.productos = limpiar(mapDocs(ps)).filter(p => p.activo !== false).sort(porOrden);
  try {
    if (cache.productos.length) sessionStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), categorias: cache.categorias, productos: cache.productos }));
    else sessionStorage.removeItem(CLAVE);
  } catch { /* ignora */ }
  notify();
}

function olvidarCartaPublica() { try { sessionStorage.removeItem(CLAVE); } catch { /* ignora */ } }

// --- Panel: escuchas en vivo (carta completa y mesas) ---
let live = 0, unsubs = [];
export function iniciarLive() {
  live++;
  if (live === 1) {
    unsubs = [
      onSnapshot(collection(db, 'categorias'), s => { olvidarCartaPublica(); cache.categorias = mapDocs(s).sort(porOrden); notify(); }, e => console.warn(e)),
      onSnapshot(collection(db, 'productos'), s => { olvidarCartaPublica(); cache.productos = mapDocs(s).sort(porOrden); notify(); }, e => console.warn(e)),
      onSnapshot(collection(db, 'mesas'), s => { cache.mesas = mapDocs(s).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0)); notify(); }, e => console.warn(e))
    ];
  }
  let liberado = false;
  return () => { if (liberado) return; liberado = true; live--; if (live === 0) { unsubs.forEach(u => u()); unsubs = []; } };
}

// --- Totales: SIEMPRE se recalculan con los precios actuales de la carta ---
export function precioItem(it, producto) {
  if (!producto) return Number(it.precio) || 0;
  if (it.variante) {
    const v = (producto.variantes || []).find(v => v.nombre === it.variante);
    if (v) return Number(v.precio) || 0;
  }
  return Number(producto.precio) || 0;
}
export function calcularItems(items, origen) {
  const avisos = []; let subtotal = 0;
  const out = (items || []).map(it => {
    const p = cache.productos.find(x => x.id === it.productoId);
    const cantidad = Math.min(99, Math.max(1, parseInt(it.cantidad, 10) || 1));
    if (!p) avisos.push(`«${it.nombre}» ya no está en la carta`);
    else {
      if (p.agotado) avisos.push(`«${p.nombre}» está marcado como agotado`);
      if (p.activo === false) avisos.push(`«${p.nombre}» está desactivado`);
    }
    const precio = precioItem(it, p);
    subtotal += precio * cantidad;
    return { productoId: it.productoId, nombre: p?.nombre || it.nombre, variante: it.variante || '', precio, cantidad, nota: it.nota || '' };
  });
  const envio = origen === 'domicilio' ? (Number(S.sitio?.tarifaDomicilio) || 0) : 0;
  return { items: out, subtotal, envio, total: subtotal + envio, avisos };
}
export function resumenItems(items) {
  return (items || []).map(i => `${i.cantidad}× ${i.nombre}${i.variante ? ` (${i.variante})` : ''}`).join(', ');
}
