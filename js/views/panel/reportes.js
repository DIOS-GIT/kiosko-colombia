// Reportes: histórico de turnos cerrados y productos más vendidos del turno actual.
import { html, render, money, fmtDateTime, toast } from '../../util.js';
import { S } from '../../session.js';
import { db, collection, query, orderBy, limit, getDocs } from '../../fb.js';
import { suscribirPedidos } from '../../pedidosStore.js';

export default function reportes(el) {
  let turnos = null, lista = [];
  function pintar() {
    const top = {};
    lista.filter(p => p.estado === 'cobrado').forEach(p => (p.items || []).forEach(i => {
      const k = i.nombre; top[k] = top[k] || { n: 0, v: 0 }; top[k].n += i.cantidad; top[k].v += i.cantidad * i.precio;
    }));
    const ranking = Object.entries(top).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
    const cerrados = (turnos || []).filter(t => t.estado === 'cerrado');
    const sum = k => cerrados.reduce((a, t) => a + (t.totales?.[k] || 0), 0);
    render(el, html`
      <div class="page-h"><h2>Reportes</h2></div>
      <h3>Turno actual: productos más vendidos</h3>
      ${ranking.length ? html`<div class="table-wrap"><table><thead><tr><th>Producto</th><th class="num">Unidades</th><th class="num">Ventas</th></tr></thead><tbody>
        ${ranking.map(([n, d]) => html`<tr><td>${n}</td><td class="num">${d.n}</td><td class="num">${money(d.v)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty small">${S.estado.abierto ? 'Aún no hay ventas cobradas en este turno.' : 'No hay un turno abierto.'}</div>`}
      <h3 class="mt">Turnos cerrados (últimos 30)</h3>
      ${turnos === null ? html`<div class="empty small">Cargando…</div>` : cerrados.length ? html`
        <div class="stats"><div class="stat"><div class="n">${money(sum('ventas'))}</div><div class="l">Ventas acumuladas</div></div>
          <div class="stat"><div class="n">${sum('pedidos')}</div><div class="l">Pedidos cobrados</div></div>
          <div class="stat"><div class="n">${money(sum('gastos'))}</div><div class="l">Gastos registrados</div></div></div>
        <div class="table-wrap"><table><thead><tr><th>Cierre</th><th>Cerró</th><th class="num">Ventas</th><th class="num">Pedidos</th><th class="num">Efectivo</th><th class="num">Diferencia</th></tr></thead><tbody>
          ${cerrados.map(t => html`<tr><td>${fmtDateTime(t.cerradoEn)}</td><td>${t.cerradoNombre || ''}</td><td class="num">${money(t.totales?.ventas)}</td><td class="num">${t.totales?.pedidos ?? 0}</td>
            <td class="num">${money(t.totales?.efectivo)}</td><td class="num" style="color:${t.diferencia ? 'var(--c-err)' : 'var(--c-ok)'}">${money(t.diferencia)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty small">Todavía no hay turnos cerrados.</div>`}`);
  }
  pintar();
  getDocs(query(collection(db, 'turnos'), orderBy('abiertoEn', 'desc'), limit(30)))
    .then(s => { turnos = s.docs.map(d => ({ id: d.id, ...d.data() })); pintar(); })
    .catch(e => { console.warn(e); turnos = []; pintar(); toast('No se pudo leer el historial', 'error'); });
  return suscribirPedidos(l => { lista = l; pintar(); });
}
