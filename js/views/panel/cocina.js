// Pantalla de cocina: cola de pedidos confirmados.
import { html, render, on, fmtTime, tiempoDesde, toast } from '../../util.js';
import { S, onChange } from '../../session.js';
import { suscribirPedidos, sonidoActivo } from '../../pedidosStore.js';
import { ORIGEN } from '../../data.js';
import * as A from '../../acciones.js';

export default function cocina(el) {
  let lista = [];
  function pintar() {
    if (!S.estado.abierto) { render(el, html`<div class="page-h"><h2>Cocina</h2></div><div class="banner">La caja está cerrada.</div>`); return; }
    const cola = lista.filter(p => p.estado === 'confirmado');
    const preparando = lista.filter(p => p.estado === 'preparando');
    const listos = lista.filter(p => p.estado === 'listo').slice(-6);
    const card = (p, accion, texto, cls) => html`<div class="pedido ${p.estado === 'listo' ? 'listo' : ''}" style="border-left-width:8px">
      <div class="row between"><span class="cod" style="font-size:1.3rem">${p.codigo}</span><span class="badge">${ORIGEN[p.origen]}${p.mesaNumero ? ' ' + p.mesaNumero : ''}</span></div>
      <div class="meta">${tiempoDesde(p.confirmadoEn || p.creadoEn)}${p.preparadoNombre ? ' · ' + p.preparadoNombre : ''}</div>
      <ul style="font-size:1.05rem">${(p.items || []).map(i => html`<li><b>${i.cantidad}×</b> ${i.nombre}${i.variante ? ` (${i.variante})` : ''}${i.nota ? html` <span class="nota">${i.nota}</span>` : ''}</li>`)}</ul>
      ${p.nota ? html`<div class="nota">💬 ${p.nota}</div>` : ''}
      ${accion ? html`<div class="acciones"><button class="btn ${cls} block" data-a="${accion}" data-id="${p.id}">${texto}</button></div>` : ''}
    </div>`;
    render(el, html`
      <div class="page-h"><h2>Cocina</h2><span class="muted small">${sonidoActivo() ? '🔔 Sonará con cada pedido nuevo' : '🔕 Sonido silenciado (menú lateral)'}</span></div>
      <div class="kanban">
        <div class="col-k"><h4>Por preparar <span class="badge gray">${cola.length}</span></h4>${cola.length ? cola.map(p => card(p, 'preparar', 'Empezar', 'primary')) : html`<div class="empty small">Nada en cola 🎉</div>`}</div>
        <div class="col-k"><h4>Preparando <span class="badge gray">${preparando.length}</span></h4>${preparando.length ? preparando.map(p => card(p, 'listo', '¡Listo!', 'ok')) : html`<div class="empty small">—</div>`}</div>
        <div class="col-k"><h4>Listos (recientes)</h4>${listos.length ? listos.map(p => card(p, '', '', '')) : html`<div class="empty small">—</div>`}</div>
      </div>`);
  }
  const off1 = suscribirPedidos(l => { lista = l; pintar(); });
  const off2 = onChange(t => { if (t === 'estado') pintar(); });
  const timer = setInterval(pintar, 60000);
  on(el, 'click', '[data-a]', async (_e, t) => {
    const p = lista.find(x => x.id === t.dataset.id); if (!p) return;
    t.disabled = true;
    try { await (t.dataset.a === 'preparar' ? A.prepararPedido(p) : A.pedidoListo(p)); } finally { t.disabled = false; }
  });
  return () => { off1(); off2(); clearInterval(timer); };
}
