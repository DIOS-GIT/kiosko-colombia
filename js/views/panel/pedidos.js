// Pedidos del turno: confirmar, entregar, cobrar.
import { html, render, on, money, fmtTime, tiempoDesde, openModal, toast, esc } from '../../util.js';
import { S, rolEn, onChange } from '../../session.js';
import { suscribirPedidos } from '../../pedidosStore.js';
import { cache, onCache, ESTADOS, ORIGEN, PAGOS, calcularItems } from '../../data.js';
import * as A from '../../acciones.js';

const PUEDE_CONFIRMAR = ['admin', 'gerente', 'mesero', 'cajero'];
const PUEDE_ENTREGAR = ['admin', 'gerente', 'mesero', 'domiciliario'];
const PUEDE_COBRAR = ['admin', 'gerente', 'cajero', 'mesero'];
const PUEDE_CREAR = ['admin', 'gerente', 'mesero', 'cajero'];

export function tarjetaPedido(p, { compacta = false } = {}) {
  const r = S.rol;
  const botones = [];
  if (p.estado === 'pendiente_confirmacion' && PUEDE_CONFIRMAR.includes(r)) {
    botones.push(html`<button class="btn sm ok" data-a="confirmar" data-id="${p.id}">Confirmar</button>`);
    botones.push(html`<button class="btn sm danger" data-a="rechazar" data-id="${p.id}">Rechazar</button>`);
  }
  if (p.estado === 'listo' && PUEDE_ENTREGAR.includes(r)) botones.push(html`<button class="btn sm primary" data-a="entregar" data-id="${p.id}">Entregar</button>`);
  if (['listo', 'entregado'].includes(p.estado) && PUEDE_COBRAR.includes(r) && !(p.origen === 'domicilio' && r === 'mesero'))
    botones.push(html`<button class="btn sm accent" data-a="cobrar" data-id="${p.id}">Cobrar</button>`);
  if (!['cobrado', 'rechazado', 'anulado', 'cancelado'].includes(p.estado) && rolEn('admin', 'gerente') && !S.temporal)
    botones.push(html`<button class="btn sm ghost" data-a="anular" data-id="${p.id}">Anular</button>`);

  const clase = p.estado === 'pendiente_confirmacion' ? 'nuevo' : p.estado === 'listo' ? 'listo' : '';
  return html`<div class="pedido ${clase}">
    <div class="row between"><span class="cod">${p.codigo}</span><span class="badge ${p.estado === 'listo' ? 'ok' : p.estado === 'pendiente_confirmacion' ? 'coral' : ''}">${ESTADOS[p.estado]}</span></div>
    <div class="meta">${ORIGEN[p.origen]}${p.mesaNumero ? ' ' + p.mesaNumero : ''} · ${fmtTime(p.creadoEn)} · ${tiempoDesde(p.creadoEn)}${p.canal === 'personal' ? ' · tomado por personal' : ''}</div>
    ${p.cliente?.nombre || p.cliente?.telefono ? html`<div class="meta">👤 ${p.cliente.nombre || ''} ${p.cliente.telefono ? html`· <a href="tel:${p.cliente.telefono}">${p.cliente.telefono}</a>` : ''}</div>` : ''}
    ${p.cliente?.direccion ? html`<div class="meta">📍 ${p.cliente.direccion}${p.cliente.referencia ? ' — ' + p.cliente.referencia : ''}</div>` : ''}
    <ul>${(p.items || []).map(i => html`<li>${i.cantidad}× ${i.nombre}${i.variante ? ` (${i.variante})` : ''}${i.nota ? html` <span class="nota">${i.nota}</span>` : ''}</li>`)}</ul>
    ${p.nota ? html`<div class="nota">💬 ${p.nota}</div>` : ''}
    <div class="row between mt"><b>${money(p.total)}</b><span class="meta">${PAGOS[p.metodoPago] || ''}</span></div>
    ${compacta ? '' : html`<div class="meta mt">
      ${p.confirmadoNombre ? html`✔ Confirmó: <b>${p.confirmadoNombre}</b> ` : ''}
      ${p.preparadoNombre ? html`· 🍳 ${p.preparadoNombre} ` : ''}${p.entregadoNombre ? html`· 🚚 ${p.entregadoNombre} ` : ''}${p.cobradoNombre ? html`· 💵 ${p.cobradoNombre}` : ''}
      ${p.rechazadoNombre ? html`✖ Rechazó: ${p.rechazadoNombre} (${p.motivoRechazo})` : ''}${p.anuladoNombre ? html`✖ Anuló: ${p.anuladoNombre} (${p.motivoAnulacion})` : ''}</div>`}
    ${botones.length ? html`<div class="acciones">${botones}</div>` : ''}
  </div>`;
}

export async function manejarAccion(t, lista) {
  const p = lista.find(x => x.id === t.dataset.id); if (!p) return;
  t.disabled = true;
  try {
    const f = { confirmar: A.confirmarPedido, rechazar: A.rechazarPedido, entregar: A.entregarPedido, cobrar: A.cobrarPedido, anular: A.anularPedido }[t.dataset.a];
    if (f) await f(p);
  } finally { t.disabled = false; }
}

export default function pedidos(el) {
  let lista = [], verCerrados = false;

  function pintar() {
    const por = est => lista.filter(p => est.includes(p.estado));
    const cols = [
      ['Por confirmar', por(['pendiente_confirmacion'])],
      ['En cocina', por(['confirmado', 'preparando'])],
      ['Listos', por(['listo'])],
      ['Por cobrar', por(['entregado'])]
    ];
    const cerrados = por(['cobrado', 'rechazado', 'anulado', 'cancelado']).reverse();
    if (!S.estado.abierto) {
      render(el, html`<div class="page-h"><h2>Pedidos</h2></div><div class="banner">La caja está cerrada. Cuando se abra un turno aparecerán aquí los pedidos.</div>`);
      return;
    }
    render(el, html`
      <div class="page-h"><h2>Pedidos</h2>
        ${PUEDE_CREAR.includes(S.rol) ? html`<button class="btn primary" id="nuevo">+ Nuevo pedido</button>` : ''}</div>
      <div class="kanban">${cols.map(([t, l]) => html`<div class="col-k"><h4>${t} <span class="badge gray">${l.length}</span></h4>
        ${l.length ? l.map(p => tarjetaPedido(p)) : html`<div class="empty small">Sin pedidos</div>`}</div>`)}</div>
      <div class="mt"><button class="btn sm ghost" id="verc">${verCerrados ? 'Ocultar' : 'Ver'} cerrados (${cerrados.length})</button></div>
      ${verCerrados ? html`<div class="kanban mt">${cerrados.map(p => tarjetaPedido(p, { compacta: false }))}</div>` : ''}`);
  }

  const off1 = suscribirPedidos(l => { lista = l; pintar(); });
  const off2 = onChange(t => { if (t === 'estado') pintar(); });
  const timer = setInterval(pintar, 60000); // refresca "hace X min"
  on(el, 'click', '[data-a]', (_e, t) => manejarAccion(t, lista));
  on(el, 'click', '#verc', () => { verCerrados = !verCerrados; pintar(); });
  on(el, 'click', '#nuevo', () => nuevoPedido());
  return () => { off1(); off2(); clearInterval(timer); };
}

// ---------- Nuevo pedido tomado por personal ----------
function nuevoPedido() {
  const items = new Map(); // productoId -> cantidad
  const mesas = cache.mesas.filter(m => m.activa !== false);
  const prods = cache.productos.filter(p => p.activo !== false && !p.agotado);
  let origen = mesas.length ? 'mesa' : 'recoger';
  const m = openModal({
    title: 'Nuevo pedido', wide: true,
    content: html`
      <div class="seg" id="seg"><button data-o="mesa" class="${origen === 'mesa' ? 'on' : ''}">Mesa</button><button data-o="recoger">Para llevar</button><button data-o="domicilio">Domicilio</button></div>
      <div class="grid2 mt" id="datos"></div>
      <input type="search" id="bus" placeholder="Buscar producto…" class="mt">
      <div id="lista" style="max-height:34vh;overflow:auto;margin-top:8px"></div>
      <div class="row between mt"><b id="tot"></b><button class="btn primary" id="crear">Crear y confirmar</button></div>
      <p class="err" id="err" hidden></p>`,
    onMount: (box, close) => {
      const datos = box.querySelector('#datos'), lista = box.querySelector('#lista');
      const pintaDatos = () => {
        datos.innerHTML = origen === 'mesa'
          ? `<label class="field"><span>Mesa</span><select id="mesa">${mesas.map(x => `<option value="${esc(x.id)}">Mesa ${esc(x.numero)}${x.zona ? ' · ' + esc(x.zona) : ''}</option>`).join('')}</select></label><label class="field"><span>Nombre (opcional)</span><input type="text" id="cn" maxlength="60"></label>`
          : `<label class="field"><span>Nombre</span><input type="text" id="cn" maxlength="60"></label><label class="field"><span>Celular</span><input type="tel" id="ct" maxlength="14"></label>`
            + (origen === 'domicilio' ? `<label class="field" style="grid-column:1/-1"><span>Dirección</span><input type="text" id="cd" maxlength="140"></label>` : '');
      };
      const pintaLista = () => {
        const q = box.querySelector('#bus').value.trim().toLowerCase();
        lista.innerHTML = prods.filter(p => !q || p.nombre.toLowerCase().includes(q)).map(p => {
          const vs = p.variantes || [];
          return `<div class="line"><span>${esc(p.nombre)} <span class="muted small">${esc(money(vs.length ? vs[0].precio : p.precio))}${vs.length ? ' (' + esc(vs[0].nombre) + ')' : ''}</span></span>
            <span class="qty"><button class="minus" data-p="${esc(p.id)}" data-d="-1">−</button><b>${items.get(p.id) || 0}</b><button data-p="${esc(p.id)}" data-d="1">+</button></span></div>`;
        }).join('') || '<div class="empty small">Sin productos</div>';
        const arr = [...items].map(([id, c]) => ({ productoId: id, cantidad: c, nombre: '', variante: (cache.productos.find(p => p.id === id)?.variantes || [])[0]?.nombre || '' }));
        box.querySelector('#tot').textContent = 'Total: ' + money(calcularItems(arr, origen).total);
      };
      pintaDatos(); pintaLista();
      box.querySelector('#seg').addEventListener('click', e => {
        const b = e.target.closest('[data-o]'); if (!b) return;
        origen = b.dataset.o; box.querySelectorAll('#seg button').forEach(x => x.classList.toggle('on', x === b)); pintaDatos(); pintaLista();
      });
      box.querySelector('#bus').addEventListener('input', pintaLista);
      lista.addEventListener('click', e => {
        const b = e.target.closest('[data-p]'); if (!b) return;
        const n = Math.max(0, Math.min(99, (items.get(b.dataset.p) || 0) + Number(b.dataset.d)));
        if (n) items.set(b.dataset.p, n); else items.delete(b.dataset.p);
        pintaLista();
      });
      box.querySelector('#crear').onclick = async ev => {
        const err = box.querySelector('#err'); err.hidden = true;
        const falla = t => { err.textContent = t; err.hidden = false; };
        if (!items.size) return falla('Agrega al menos un producto.');
        const nombre = (box.querySelector('#cn')?.value || '').trim();
        const tel = (box.querySelector('#ct')?.value || '').replace(/\D/g, '');
        const dir = (box.querySelector('#cd')?.value || '').trim();
        if (origen !== 'mesa' && nombre.length < 2) return falla('Escribe el nombre del cliente.');
        if (origen === 'domicilio' && (dir.length < 6 || tel.length < 7)) return falla('Para domicilio escribe dirección y celular.');
        const mesa = origen === 'mesa' ? cache.mesas.find(x => x.id === box.querySelector('#mesa')?.value) : null;
        if (origen === 'mesa' && !mesa) return falla('Elige una mesa.');
        const arr = [...items].map(([id, c]) => {
          const p = cache.productos.find(x => x.id === id);
          return { productoId: id, nombre: p.nombre, variante: (p.variantes || [])[0]?.nombre || '', cantidad: c, nota: '' };
        });
        ev.target.disabled = true;
        try {
          const cod = await A.crearPedidoStaff({
            origen, mesa, items: arr,
            cliente: { nombre, ...(tel ? { telefono: tel } : {}), ...(dir ? { direccion: dir } : {}) }
          });
          toast(`Pedido ${cod} creado y enviado a cocina`, 'ok'); close();
        } catch (e) {
          console.error(e); ev.target.disabled = false;
          falla(e.code === 'permission-denied' ? 'No se pudo crear (¿caja cerrada?).' : 'No se pudo crear el pedido.');
        }
      };
    }
  });
}
