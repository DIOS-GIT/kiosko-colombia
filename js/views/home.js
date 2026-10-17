// Sitio público: portada + carta. No requiere cuenta.
import { html, render, on, money, esc, imgUrl, go, toast, openModal, safeUrl } from '../util.js';
import { S, onChange } from '../session.js';
import { cache, cargarCartaPublica, ETIQUETAS } from '../data.js';
import { cart, getMesa, setMesa, clearMesa, misPedidosIds } from '../cart.js';
import { db, doc, getDoc } from '../fb.js';
import { ESTADOS } from '../data.js';

export async function entrarMesa({ id }) {
  try {
    const snap = await getDoc(doc(db, 'mesas', id));
    if (snap.exists() && snap.data().activa !== false) {
      setMesa({ id, numero: snap.data().numero, zona: snap.data().zona || '' });
      toast(`Estás en la mesa ${snap.data().numero}`, 'ok');
    } else toast('Ese código de mesa no es válido.', 'error');
  } catch { toast('No se pudo validar la mesa.', 'error'); }
  go('/', true);
}

export default async function home(_p, _q, root) {
  render(root, html`<div class="splash"><div class="spinner"></div></div>`);
  try { await cargarCartaPublica(); } catch (e) { console.warn(e); }

  let cat = 'todas', busca = '';
  const offs = [];

  function pintar() {
    const sitio = S.sitio || {};
    const mesa = getMesa();
    const abierto = !!S.estado.abierto && S.estado.pedidosEnLinea !== false;
    const cats = cache.categorias.filter(c => cache.productos.some(p => p.categoriaId === c.id));
    const prods = cache.productos.filter(p =>
      (cat === 'todas' || p.categoriaId === cat) &&
      (!busca || (p.nombre + ' ' + (p.descripcion || '')).toLowerCase().includes(busca)));
    const grupos = cats.filter(c => cat === 'todas' || c.id === cat)
      .map(c => ({ c, lista: prods.filter(p => p.categoriaId === c.id) })).filter(g => g.lista.length);
    const sinCat = prods.filter(p => !cache.categorias.some(c => c.id === p.categoriaId));
    if (sinCat.length && cat === 'todas') grupos.push({ c: { id: 'otros', nombre: 'Otros' }, lista: sinCat });
    const n = cart.count();

    render(root, html`
      <header class="hero">
        <div class="sun"></div>
        <div class="top-links"><a href="#/login">Personal</a></div>
        <div class="hero-in">
          ${sitio.logo ? html`<img class="logo" src="${imgUrl(sitio.logo, 160)}" alt="Logo">` : ''}
          <h1>${sitio.nombre || 'Kiosko Colombia'}</h1>
          <p>${sitio.eslogan || 'Sabor de la costa, hecho con cariño.'}</p>
          <div>
            ${sitio.horario ? html`<span class="pill-info">🕒 ${sitio.horario}</span>` : ''}
            ${sitio.direccion ? html`<span class="pill-info">📍 ${sitio.direccion}</span>` : ''}
            ${sitio.telefono ? html`<a class="pill-info" style="color:#fff;text-decoration:none" href="tel:${sitio.telefono}">📞 ${sitio.telefono}</a>` : ''}
          </div>
          <span class="estado-local ${abierto ? 'on' : 'off'}">${abierto ? '● Recibiendo pedidos' : '● Pedidos cerrados por ahora'}</span>
          ${misPedidosIds().length ? html` <button class="btn sm" id="mis" style="margin-left:6px">Mis pedidos</button>` : ''}
        </div>
      </header>
      ${S.configurado === false ? html`<div class="banner" style="max-width:1100px;margin:12px auto 0">⚙️ Este sitio aún no está configurado. <a href="#/setup"><b>Crear el administrador →</b></a></div>` : ''}
      ${mesa ? html`<div class="mesa-banner">🪑 Estás en la mesa ${mesa.numero}${mesa.zona ? ' · ' + mesa.zona : ''}
        <button class="btn sm" id="salirMesa">No es mi mesa</button></div>` : ''}
      ${sitio.aviso ? html`<div class="banner" style="max-width:1100px;margin:12px auto 0">${sitio.aviso}</div>` : ''}
      <nav class="cats" aria-label="Categorías">
        <button class="chip ${cat === 'todas' ? 'on' : ''}" data-cat="todas">Todo</button>
        ${cats.map(c => html`<button class="chip ${cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.nombre}</button>`)}
      </nav>
      <main class="menu">
        <input type="search" id="buscar" placeholder="Buscar en la carta…" value="${busca}" style="margin:6px 0 4px">
        ${grupos.length ? grupos.map(g => html`
          <h2>${g.c.nombre}</h2>
          <div class="items">${g.lista.map(p => html`
            <article class="item ${p.agotado ? 'agotado' : ''}" data-p="${p.id}" tabindex="0" role="button">
              ${p.imagen ? html`<img loading="lazy" src="${imgUrl(p.imagen, 300)}" alt="${p.nombre}">` : html`<div class="ph">🍽️</div>`}
              <div class="grow">
                <h3>${p.nombre}</h3>
                <p>${p.descripcion || ''}</p>
                <div class="tags">${(p.etiquetas || []).map(t => html`<span class="tag">${t}</span>`)}${p.agotado ? html`<span class="tag" style="background:#fde3df">agotado</span>` : ''}</div>
                <div class="price">${(p.variantes || []).length ? 'Desde ' + money(Math.min(...p.variantes.map(v => Number(v.precio) || 0))) : money(p.precio)}</div>
              </div>
            </article>`)}</div>`)
          : html`<div class="empty">${cache.productos.length ? 'No encontramos nada con esa búsqueda.' : 'La carta se está preparando. ¡Vuelve pronto!'}</div>`}
      </main>
      <footer class="footer">${sitio.nombre || 'Kiosko Colombia'} · ${sitio.instagram ? html`<a href="${safeUrl(sitio.instagram)}" target="_blank" rel="noopener">Instagram</a> · ` : ''}Hecho con 🌴</footer>
      ${n ? html`<button class="cartbar" id="irCarrito"><span>🛒 ${n} ${n === 1 ? 'producto' : 'productos'}</span><b>Ver pedido · ${money(cart.subtotal())}</b></button>` : ''}
    `);
    const b = root.querySelector('#buscar');
    if (busca) { b.focus(); b.setSelectionRange(busca.length, busca.length); }
  }

  pintar();

  on(root, 'click', '[data-cat]', (_e, t) => { cat = t.dataset.cat; pintar(); });
  on(root, 'click', '[data-p]', (_e, t) => abrirProducto(t.dataset.p));
  on(root, 'keydown', '[data-p]', (e, t) => { if (e.key === 'Enter') abrirProducto(t.dataset.p); });
  on(root, 'click', '#irCarrito', () => go('/carrito'));
  on(root, 'click', '#salirMesa', () => { clearMesa(); pintar(); });
  on(root, 'click', '#mis', abrirMisPedidos);
  root.addEventListener('input', e => { if (e.target.id === 'buscar') { busca = e.target.value.trim().toLowerCase(); pintar(); } });

  offs.push(cart.subscribe(pintar));
  offs.push(onChange(t => { if (t === 'estado' || t === 'sitio') pintar(); }));
  return () => offs.forEach(f => f());
}

function abrirProducto(id) {
  const p = cache.productos.find(x => x.id === id);
  if (!p) return;
  const abierto = !!S.estado.abierto && S.estado.pedidosEnLinea !== false;
  const vars = p.variantes || [];
  let q = 1, v = vars.length ? vars[0].nombre : '';
  openModal({
    title: p.nombre,
    content: html`
      ${p.imagen ? html`<img src="${imgUrl(p.imagen, 700)}" alt="${p.nombre}" style="border-radius:14px;margin-bottom:10px;max-height:260px;width:100%;object-fit:cover">` : ''}
      <p class="muted">${p.descripcion || ''}</p>
      <div class="tags">${(p.etiquetas || []).map(t => html`<span class="tag">${t}</span>`)}</div>
      ${vars.length ? html`<div class="field mt"><span>Elige una opción</span>
        <div class="checks" id="vars">${vars.map((x, i) => html`<label><input type="radio" name="v" value="${x.nombre}" ${i === 0 ? 'checked' : ''}> ${x.nombre} · ${money(x.precio)}</label>`)}</div></div>` : ''}
      <label class="field mt"><span>Nota para la cocina (opcional)</span><input type="text" id="nota" maxlength="120" placeholder="Sin cebolla, poco picante…"></label>
      <div class="row between mt">
        <div class="qty"><button class="minus" data-q="-1" aria-label="Menos">−</button><b id="q">1</b><button data-q="1" aria-label="Más">+</button></div>
        <button class="btn primary" id="add" ${p.agotado ? 'disabled' : ''}>${p.agotado ? 'Agotado' : 'Agregar'}</button>
      </div>
      ${!abierto ? html`<p class="small muted mt">Ahora mismo no estamos recibiendo pedidos en línea, pero puedes dejar el carrito listo.</p>` : ''}`,
    onMount: (el, close) => {
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-q]');
        if (b) { q = Math.min(20, Math.max(1, q + Number(b.dataset.q))); el.querySelector('#q').textContent = q; }
      });
      el.addEventListener('change', e => { if (e.target.name === 'v') v = e.target.value; });
      el.querySelector('#add').onclick = () => {
        cart.add(p, v, q, el.querySelector('#nota').value.trim());
        toast('Agregado al pedido', 'ok', 1500); close();
      };
    }
  });
}

async function abrirMisPedidos() {
  const ids = misPedidosIds();
  openModal({
    title: 'Mis pedidos',
    content: html`<p class="muted small">Se guardan solo en este dispositivo.</p>
      ${ids.map(id => html`<a class="line" href="#/pedido/${id}" data-cerrar><span>Pedido …${id.slice(-4)}</span><span>Ver estado →</span></a>`)}`,
    onMount: (el, close) => { el.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) close(); }); }
  });
}
