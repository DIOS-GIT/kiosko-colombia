// Escucha ÚNICA y compartida de los pedidos del turno abierto (ahorra lecturas).
import { db, collection, query, where, onSnapshot } from './fb.js';
import { S, onChange } from './session.js';
import { beep, toast, tsToDate } from './util.js';

const st = { lista: [], subs: new Set(), unsub: null, turno: null, primera: true, usos: 0, off: null };

export const sonidoActivo = () => localStorage.getItem('kiosko.sonido') !== 'no';
export const alternarSonido = () => { localStorage.setItem('kiosko.sonido', sonidoActivo() ? 'no' : 'si'); return sonidoActivo(); };

export const todosLosPedidos = () => st.lista;
export function suscribirPedidos(fn) { st.subs.add(fn); fn(st.lista); return () => st.subs.delete(fn); }
const notificar = () => st.subs.forEach(f => { try { f(st.lista); } catch (e) { console.error(e); } });

const ROLES_CONFIRMAN = ['admin', 'gerente', 'mesero', 'cajero'];
const ROLES_COCINA = ['admin', 'gerente', 'cocina'];
const ROLES_ENTREGA = ['admin', 'gerente', 'mesero', 'domiciliario'];

function parar() { if (st.unsub) { st.unsub(); st.unsub = null; } st.turno = null; }

function arrancar() {
  const turno = S.estado.abierto ? S.estado.turnoId : null;
  if (!S.rol || turno === st.turno && st.unsub) return;
  parar();
  st.lista = []; st.primera = true; st.turno = turno;
  if (!turno) { notificar(); return; }
  const filtros = [where('turnoId', '==', turno)];
  if (S.rol === 'domiciliario') filtros.push(where('origen', '==', 'domicilio'));
  st.unsub = onSnapshot(query(collection(db, 'pedidos'), ...filtros), snap => {
    if (!st.primera) {
      snap.docChanges().forEach(c => {
        if (c.doc.metadata.hasPendingWrites) return; // cambios propios
        const p = c.doc.data();
        if (c.type === 'added' && p.estado === 'pendiente_confirmacion' && ROLES_CONFIRMAN.includes(S.rol)) aviso(`Nuevo pedido ${p.codigo}`, 880);
        else if (p.estado === 'confirmado' && ROLES_COCINA.includes(S.rol) && c.type !== 'removed') aviso(`Cocina: pedido ${p.codigo}`, 660);
        else if (c.type === 'modified' && p.estado === 'listo' && ROLES_ENTREGA.includes(S.rol)) aviso(`Listo para entregar: ${p.codigo}`, 990);
      });
    }
    st.primera = false;
    st.lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (tsToDate(a.creadoEn) ?? new Date()) - (tsToDate(b.creadoEn) ?? new Date()));
    notificar();
  }, e => { console.warn('pedidos', e); toast('No se pudieron leer los pedidos.', 'error'); });
}
function aviso(msg, freq) { toast(msg, 'ok', 6000); if (sonidoActivo()) beep(freq); }

// El panel llama a usarPedidos() al abrir y libera con la función devuelta.
export function usarPedidos() {
  st.usos++;
  if (st.usos === 1) { arrancar(); st.off = onChange(t => { if (t === 'estado' || t === 'auth') arrancar(); }); }
  let libre = false;
  return () => {
    if (libre) return; libre = true; st.usos--;
    if (st.usos === 0) { parar(); st.lista = []; if (st.off) st.off(); }
  };
}
