// Escáner QR para el personal: busca pedidos por QR (de pedido o de mesa) o por código.
import { html, render, on, loadScript, toast, money } from '../../util.js';
import { suscribirPedidos } from '../../pedidosStore.js';
import { cache, ESTADOS, ORIGEN } from '../../data.js';

export default function escaner(el) {
  let lista = [], scanner = null, resultado = null;
  const parar = async () => { if (scanner) { try { await scanner.stop(); scanner.clear(); } catch { /* ignora */ } scanner = null; } };

  function buscar(texto) {
    const t = String(texto || '').trim();
    let m;
    if ((m = t.match(/#\/pedido\/([A-Za-z0-9]+)/))) { const p = lista.find(x => x.id === m[1]); return { titulo: 'Pedido', pedidos: p ? [p] : [] }; }
    if ((m = t.match(/#\/mesa\/([A-Za-z0-9]+)/))) {
      const mesa = cache.mesas.find(x => x.id === m[1]);
      return { titulo: mesa ? `Mesa ${mesa.numero}` : 'Mesa', pedidos: lista.filter(p => p.mesaId === m[1] && !['cobrado', 'rechazado', 'anulado', 'cancelado'].includes(p.estado)) };
    }
    const cod = t.toUpperCase().replace(/\s/g, '');
    return { titulo: `Código ${cod}`, pedidos: lista.filter(p => p.codigo === cod || p.codigo === 'K-' + cod) };
  }
  function pintar() {
    render(el, html`
      <div class="page-h"><h2>Escáner QR</h2></div>
      <div class="card" style="max-width:520px">
        <button class="btn primary block" id="scan">${scanner ? 'Detener cámara' : '📷 Escanear'}</button>
        <div id="reader" class="scan-box mt"></div>
        <form id="f" class="row gap mt"><input type="text" name="c" placeholder="o escribe un código (K-1234)" style="flex:1"><button class="btn">Buscar</button></form>
      </div>
      ${resultado ? html`<h3 class="mt">${resultado.titulo}</h3>${resultado.pedidos.length
        ? resultado.pedidos.map(p => html`<div class="pedido"><div class="row between"><span class="cod">${p.codigo}</span><span class="badge">${ESTADOS[p.estado]}</span></div>
            <div class="meta">${ORIGEN[p.origen]}${p.mesaNumero ? ' ' + p.mesaNumero : ''}</div>
            <ul>${(p.items || []).map(i => html`<li>${i.cantidad}× ${i.nombre}</li>`)}</ul><b>${money(p.total)}</b>
            <div class="acciones"><a class="btn sm" href="#/panel/pedidos">Ir a Pedidos</a></div></div>`)
        : html`<div class="empty small">No hay pedidos del turno actual con eso.</div>`}` : ''}`);
  }
  pintar();
  const off = suscribirPedidos(l => { lista = l; });

  on(el, 'click', '#scan', async () => {
    if (scanner) { await parar(); pintar(); return; }
    try {
      await loadScript('vendor/html5-qrcode.min.js');
      pintar();
      scanner = new window.Html5Qrcode('reader');
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 230 }, async texto => {
        await parar(); resultado = buscar(texto); pintar();
      });
      el.querySelector('#scan').textContent = 'Detener cámara';
    } catch { toast('No se pudo abrir la cámara.', 'error'); scanner = null; }
  });
  el.addEventListener('submit', e => { e.preventDefault(); resultado = buscar(new FormData(e.target).get('c')); pintar(); });
  return () => { off(); parar(); };
}
