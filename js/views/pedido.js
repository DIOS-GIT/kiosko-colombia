// Seguimiento del pedido en tiempo real (para el cliente).
import { html, render, on, money, go, toast, fmtTime, confirmar } from '../util.js';
import { ESTADOS, ORIGEN, PAGOS } from '../data.js';
import { db, doc, onSnapshot, updateDoc } from '../fb.js';
import { S } from '../session.js';
import { urlPedido, qrDataUrl } from '../qr.js';

const PASOS = [['pendiente_confirmacion', 'Recibido'], ['confirmado', 'Confirmado'], ['preparando', 'Preparando'], ['listo', 'Listo'], ['entregado', 'Entregado']];

export default function seguimiento({ id }, _q, root) {
  render(root, html`<div class="splash"><div class="spinner"></div></div>`);
  let qr = '';
  qrDataUrl(urlPedido(id), 300).then(u => { qr = u; }).catch(() => {});

  const off = onSnapshot(doc(db, 'pedidos', id), snap => {
    if (!snap.exists()) {
      render(root, html`<div class="pad" style="max-width:560px"><div class="empty"><p>No encontramos este pedido.</p>
        <p class="small">Solo se puede ver desde el mismo dispositivo con el que se hizo.</p><a class="btn primary" href="#/">Ir a la carta</a></div></div>`);
      return;
    }
    const p = { id, ...snap.data() };
    const idx = PASOS.findIndex(x => x[0] === p.estado || (p.estado === 'cobrado' && x[0] === 'entregado'));
    const cerrado = ['rechazado', 'anulado', 'cancelado'].includes(p.estado);
    render(root, html`<div class="pad" style="max-width:560px">
      <a href="#/">← Volver a la carta</a>
      <div class="card mt center">
        <div class="muted small">Tu código de pedido</div>
        <div class="codigo-grande">${p.codigo}</div>
        <span class="badge ${cerrado ? 'err' : p.estado === 'listo' ? 'ok' : ''}">${ESTADOS[p.estado] || p.estado}</span>
        <span class="badge gray">${ORIGEN[p.origen]}${p.mesaNumero ? ' ' + p.mesaNumero : ''}</span>
        ${cerrado ? '' : html`<div class="steps">${PASOS.map((s, i) => html`
          <div class="step ${i < idx ? 'done' : ''} ${i === idx ? 'now' : ''}"><div class="dot">${i < idx ? '✓' : i + 1}</div>${s[1]}</div>`)}</div>`}
        ${p.estado === 'pendiente_confirmacion' ? html`<p class="muted">Esperando que un mesero confirme tu pedido…</p>` : ''}
        ${p.estado === 'listo' ? html`<p><b>¡Tu pedido está listo!</b> ${p.origen === 'recoger' ? 'Puedes pasar a recogerlo.' : p.origen === 'mesa' ? 'Ya te lo llevan.' : 'El domiciliario va en camino.'}</p>` : ''}
        ${p.estado === 'rechazado' ? html`<div class="banner err">No pudimos aceptar tu pedido: ${p.motivoRechazo || 'sin detalle'}.</div>` : ''}
        ${p.estado === 'anulado' ? html`<div class="banner err">Este pedido fue anulado.</div>` : ''}
        ${p.confirmadoNombre ? html`<p class="small muted">Confirmado por ${p.confirmadoNombre} · ${fmtTime(p.confirmadoEn)}</p>` : ''}
      </div>
      <div class="card mt">
        ${(p.items || []).map(i => html`<div class="line"><span>${i.cantidad}× ${i.nombre}${i.variante ? ` (${i.variante})` : ''}${i.nota ? html`<div class="nota">${i.nota}</div>` : ''}</span><span>${money(i.precio * i.cantidad)}</span></div>`)}
        ${p.envio ? html`<div class="line"><span>Domicilio</span><span>${money(p.envio)}</span></div>` : ''}
        <div class="line total"><span>Total</span><span>${money(p.total)}</span></div>
        <p class="small muted">Pago: ${PAGOS[p.metodoPago] || '—'} · Creado ${fmtTime(p.creadoEn)}</p>
      </div>
      <div class="row gap mt wrap">
        ${p.estado === 'pendiente_confirmacion' ? html`<button class="btn danger" id="cancelar">Cancelar pedido</button>` : ''}
        <button class="btn" id="copiar">Copiar enlace</button>
      </div>
    </div>`);
  }, err => {
    console.warn(err);
    render(root, html`<div class="pad" style="max-width:560px"><div class="empty"><p>No tienes permiso para ver este pedido.</p>
      <p class="small">Ábrelo desde el mismo dispositivo con el que lo hiciste.</p><a class="btn primary" href="#/">Ir a la carta</a></div></div>`);
  });

  on(root, 'click', '#cancelar', async () => {
    if (!await confirmar('¿Seguro que quieres cancelar este pedido?', { titulo: 'Cancelar pedido', ok: 'Sí, cancelar', cancelar: 'No', peligro: true })) return;
    try { await updateDoc(doc(db, 'pedidos', id), { estado: 'cancelado' }); toast('Pedido cancelado'); }
    catch { toast('Ya no se puede cancelar: el pedido fue confirmado.', 'error'); }
  });
  on(root, 'click', '#copiar', async () => {
    try { await navigator.clipboard.writeText(urlPedido(id)); toast('Enlace copiado', 'ok'); } catch { toast(urlPedido(id)); }
  });
  return off;
}
