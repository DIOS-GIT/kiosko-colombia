// Auditoría: quién hizo qué y cuándo. Solo lectura (nadie puede editarla ni borrarla).
import { html, render, fmtDateTime, toast } from '../../util.js';
import { db, collection, query, orderBy, limit, onSnapshot } from '../../fb.js';

export default function auditoria(el) {
  let lista = [], filtro = '';
  function pintar() {
    const f = filtro.toLowerCase();
    const l = lista.filter(a => !f || `${a.actorNombre} ${a.accion} ${a.detalle} ${a.rol}`.toLowerCase().includes(f));
    render(el, html`
      <div class="page-h"><h2>Auditoría</h2></div>
      <input type="search" id="q" placeholder="Filtrar por persona, acción o código de pedido…" value="${filtro}" style="max-width:420px;margin-bottom:12px">
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>
        ${l.map(a => html`<tr><td>${fmtDateTime(a.fecha)}</td><td><b>${a.actorNombre}</b><div class="muted small">${a.rol}</div></td><td><span class="badge">${a.accion}</span></td><td>${a.detalle}</td></tr>`)}
        ${l.length ? '' : html`<tr><td colspan="4" class="empty">Sin registros.</td></tr>`}</tbody></table></div>
      <p class="muted small mt">Se muestran los últimos 200 movimientos.</p>`);
    const q = el.querySelector('#q'); if (filtro) { q.focus(); q.setSelectionRange(filtro.length, filtro.length); }
  }
  pintar();
  el.addEventListener('input', e => { if (e.target.id === 'q') { filtro = e.target.value; pintar(); } });
  return onSnapshot(query(collection(db, 'auditoria'), orderBy('fecha', 'desc'), limit(200)),
    s => { lista = s.docs.map(d => ({ id: d.id, ...d.data() })); pintar(); },
    e => { console.warn(e); toast('No se pudo leer la auditoría', 'error'); });
}
