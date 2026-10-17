// Carrito y envío del pedido (cliente sin cuenta).
import { html, render, on, money, go, toast, codigoPedido, randomId, numero } from '../util.js';
import { S, onChange } from '../session.js';
import { cache, cargarCartaPublica, calcularItems, ORIGEN, PAGOS } from '../data.js';
import { cart, getMesa, clearMesa, guardarPedidoId } from '../cart.js';
import { db, doc, setDoc, serverTimestamp } from '../fb.js';

const KEY = 'kiosko.cliente.v1';
const leerCliente = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

export default async function vistaCarrito(_p, _q, root) {
  try { await cargarCartaPublica(); } catch { /* usa lo que haya */ }
  const mesa = getMesa();
  const guardado = leerCliente();
  let origen = mesa ? 'mesa' : (guardado.origen === 'domicilio' ? 'domicilio' : 'recoger');
  let enviando = false;

  function pintar() {
    const abierto = !!S.estado.abierto && S.estado.pedidosEnLinea !== false;
    const calc = calcularItems(cart.items, origen);
    const sitio = S.sitio || {};
    if (!cart.items.length) {
      render(root, html`<div class="pad"><a href="#/">← Volver a la carta</a>
        <div class="empty"><div style="font-size:3rem">🛒</div><p>Tu pedido está vacío.</p><a class="btn primary" href="#/">Ver la carta</a></div></div>`);
      return;
    }
    const f = leerCliente();
    render(root, html`<div class="pad" style="max-width:640px">
      <a href="#/">← Seguir pidiendo</a>
      <h2 class="mt">Tu pedido</h2>
      <div class="card">
        ${cart.items.map(i => html`<div class="line">
          <div><b>${i.nombre}</b>${i.variante ? html` <span class="muted">(${i.variante})</span>` : ''}
            ${i.nota ? html`<div class="nota">${i.nota}</div>` : ''}
            <div class="muted small">${money(calc.items.find(x => x.productoId === i.productoId && x.variante === i.variante)?.precio ?? i.precio)} c/u</div></div>
          <div class="qty"><button class="minus" data-k="${i.key}" data-d="-1" aria-label="Menos">−</button><b>${i.cantidad}</b><button data-k="${i.key}" data-d="1" aria-label="Más">+</button></div>
        </div>`)}
        <div class="line"><span>Subtotal</span><b>${money(calc.subtotal)}</b></div>
        ${origen === 'domicilio' ? html`<div class="line"><span>Domicilio</span><b>${money(calc.envio)}</b></div>` : ''}
        <div class="line total"><span>Total</span><span>${money(calc.total)}</span></div>
        ${calc.avisos.length ? html`<div class="banner mt">${calc.avisos.map(a => html`<div>⚠️ ${a}</div>`)}</div>` : ''}
        <p class="small muted">El total final lo confirma el mesero con los precios vigentes de la carta.</p>
      </div>

      <div class="card mt">
        ${mesa ? html`<p><b>🪑 Mesa ${mesa.numero}</b> <button class="btn sm ghost" id="cambiaMesa">Cambiar</button></p>`
          : html`<div class="seg" id="seg">
              <button data-o="recoger" class="${origen === 'recoger' ? 'on' : ''}">Para recoger</button>
              <button data-o="domicilio" class="${origen === 'domicilio' ? 'on' : ''}">Domicilio</button>
            </div>`}
        <form id="f" class="mt" autocomplete="on">
          <label class="field"><span>Tu nombre ${origen === 'mesa' ? '(opcional)' : ''}</span>
            <input type="text" name="nombre" maxlength="60" value="${f.nombre || ''}" ${origen === 'mesa' ? '' : 'required'} autocomplete="name"></label>
          ${origen !== 'mesa' ? html`<label class="field"><span>Celular</span>
            <input type="tel" name="telefono" inputmode="numeric" maxlength="14" value="${f.telefono || ''}" required autocomplete="tel" placeholder="3001234567"></label>` : ''}
          ${origen === 'domicilio' ? html`
            <label class="field"><span>Dirección</span><input type="text" name="direccion" maxlength="140" value="${f.direccion || ''}" required autocomplete="street-address" placeholder="Barrio, calle, número"></label>
            <label class="field"><span>Referencia</span><input type="text" name="referencia" maxlength="120" value="${f.referencia || ''}" placeholder="Edificio, apto, color de la casa…"></label>` : ''}
          <label class="field"><span>¿Cómo pagarás?</span>
            <select name="pago">${Object.entries(PAGOS).filter(([k]) => origen === 'domicilio' || k !== 'contraentrega').map(([k, v]) => html`<option value="${k}" ${(f.pago || 'efectivo') === k ? 'selected' : ''}>${k === 'contraentrega' ? 'Contraentrega (efectivo al recibir)' : v}</option>`)}</select></label>
          <label class="field"><span>Comentario general (opcional)</span><textarea name="nota" rows="2" maxlength="300"></textarea></label>
          <p class="err" id="err" hidden></p>
          <button class="btn primary block" id="enviar" ${abierto ? '' : 'disabled'}>${abierto ? 'Enviar pedido' : 'Pedidos cerrados por ahora'}</button>
          ${origen === 'mesa' ? html`<p class="small muted center mt">Un mesero confirmará tu pedido y pasará a cocina.</p>` : ''}
        </form>
      </div>
    </div>`);
  }
  pintar();

  on(root, 'click', '[data-k]', (_e, t) => {
    const it = cart.items.find(i => i.key === t.dataset.k); if (it) cart.setQty(it.key, it.cantidad + Number(t.dataset.d));
  });
  on(root, 'click', '[data-o]', (_e, t) => { origen = t.dataset.o; pintar(); });
  on(root, 'click', '#cambiaMesa', () => { clearMesa(); location.reload(); });

  root.addEventListener('submit', async e => {
    e.preventDefault();
    if (enviando) return;
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const err = root.querySelector('#err'); err.hidden = true;
    const falla = m => { err.textContent = m; err.hidden = false; };
    const nombre = (fd.nombre || '').trim();
    const tel = String(fd.telefono || '').replace(/\D/g, '');
    if (origen !== 'mesa') {
      if (nombre.length < 2) return falla('Escribe tu nombre.');
      if (!/^(57)?3\d{9}$/.test(tel)) return falla('Escribe un celular colombiano válido (10 dígitos, empieza por 3).');
    }
    if (origen === 'domicilio' && (fd.direccion || '').trim().length < 6) return falla('Escribe la dirección completa.');
    if (!S.estado.abierto || !S.estado.turnoId) return falla('Ahora no estamos recibiendo pedidos.');

    const calc = calcularItems(cart.items, origen);
    if (calc.items.some(i => !cache.productos.find(p => p.id === i.productoId))) return falla('Algún producto ya no está disponible. Revisa tu pedido.');
    if (calc.items.some(i => cache.productos.find(p => p.id === i.productoId)?.agotado)) return falla('Hay productos agotados en tu pedido. Quítalos para continuar.');

    const id = randomId(20, 'abcdefghijkmnpqrstuvwxyz23456789');
    const pedido = {
      codigo: codigoPedido(),
      origen,
      ...(origen === 'mesa' ? { mesaId: mesa.id, mesaNumero: mesa.numero } : {}),
      uidCliente: S.user.uid,
      cliente: {
        nombre: nombre.slice(0, 60),
        ...(origen !== 'mesa' ? { telefono: tel } : {}),
        ...(origen === 'domicilio' ? { direccion: fd.direccion.trim().slice(0, 140), referencia: (fd.referencia || '').trim().slice(0, 120) } : {})
      },
      items: calc.items.map(i => ({ productoId: i.productoId, nombre: i.nombre, variante: i.variante, precio: i.precio, cantidad: i.cantidad, nota: i.nota })),
      subtotal: calc.subtotal, envio: calc.envio, total: calc.total,
      estado: 'pendiente_confirmacion',
      turnoId: S.estado.turnoId,
      creadoEn: serverTimestamp(),
      metodoPago: fd.pago || 'efectivo',
      nota: (fd.nota || '').trim().slice(0, 300),
      canal: 'web'
    };
    enviando = true;
    const btn = root.querySelector('#enviar'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await setDoc(doc(db, 'pedidos', id), pedido);
      try { localStorage.setItem(KEY, JSON.stringify({ nombre, telefono: tel, direccion: fd.direccion || '', referencia: fd.referencia || '', pago: fd.pago, origen: origen === 'mesa' ? 'recoger' : origen })); } catch { /* ignora */ }
      guardarPedidoId(id);
      cart.clear();
      go('/pedido/' + id, true);
    } catch (ex) {
      console.error(ex);
      enviando = false; btn.disabled = false; btn.textContent = 'Enviar pedido';
      falla(ex.code === 'permission-denied'
        ? 'No pudimos enviar el pedido: puede que el local acabe de cerrar. Intenta de nuevo.'
        : 'No se pudo enviar. Revisa tu conexión.');
    }
  });

  const off1 = cart.subscribe(pintar);
  const off2 = onChange(t => { if (t === 'estado' && !enviando) pintar(); });
  return () => { off1(); off2(); };
}
