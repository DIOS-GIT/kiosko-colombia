// Carta: categorías y productos (admin edita todo; gerente y cocina marcan «agotado»).
import { html, render, on, toast, openModal, confirmar, money, numero, imgUrl, randomId, esc } from '../../util.js';
import { S, auditar } from '../../session.js';
import { cache, onCache, ETIQUETAS } from '../../data.js';
import { db, doc, writeBatch, updateDoc } from '../../fb.js';
import { subirImagen } from '../../cloudinary.js';

export default function carta(el) {
  const admin = S.rol === 'admin';
  let filtro = 'todas';

  function pintar() {
    const ps = cache.productos.filter(p => filtro === 'todas' || p.categoriaId === filtro);
    render(el, html`
      <div class="page-h"><h2>Carta</h2>
        ${admin ? html`<div class="row gap wrap"><button class="btn" id="ncat">+ Categoría</button><button class="btn primary" id="nprod">+ Producto</button></div>` : ''}</div>
      <div class="cats" style="position:static;padding-left:0;border:0">
        <button class="chip ${filtro === 'todas' ? 'on' : ''}" data-f="todas">Todo (${cache.productos.length})</button>
        ${cache.categorias.map(c => html`<button class="chip ${filtro === c.id ? 'on' : ''}" data-f="${c.id}">${c.nombre}${c.activa === false ? ' (oculta)' : ''}</button>`)}
        ${admin && filtro !== 'todas' ? html`<button class="chip" data-ecat="${filtro}">✏️ Editar categoría</button>` : ''}
      </div>
      ${ps.length ? html`<div class="table-wrap"><table><thead><tr><th></th><th>Producto</th><th class="num">Precio</th><th>Estado</th><th></th></tr></thead><tbody>
        ${ps.map(p => html`<tr>
          <td>${p.imagen ? html`<img class="thumb" src="${imgUrl(p.imagen, 120)}" alt="">` : html`<div class="thumb"></div>`}</td>
          <td><b>${p.nombre}</b><div class="muted small">${cache.categorias.find(c => c.id === p.categoriaId)?.nombre || 'Sin categoría'}${(p.variantes || []).length ? ' · ' + p.variantes.length + ' opciones' : ''}</div></td>
          <td class="num">${money(p.precio)}</td>
          <td>${p.activo === false ? html`<span class="badge gray">Oculto</span>` : ''} ${p.agotado ? html`<span class="badge err">Agotado</span>` : html`<span class="badge ok">Disponible</span>`}</td>
          <td class="num"><button class="btn sm" data-ag="${p.id}">${p.agotado ? 'Hay de nuevo' : 'Marcar agotado'}</button>
            ${admin ? html` <button class="btn sm" data-ep="${p.id}">Editar</button>` : ''}</td></tr>`)}
      </tbody></table></div>` : html`<div class="empty">${cache.productos.length ? 'No hay productos en esta categoría.' : 'La carta está vacía.'}</div>`}`);
  }
  pintar();
  const off = onCache(pintar);

  on(el, 'click', '[data-f]', (_e, t) => { filtro = t.dataset.f; pintar(); });
  on(el, 'click', '#ncat', () => formCategoria(null));
  on(el, 'click', '[data-ecat]', (_e, t) => formCategoria(cache.categorias.find(c => c.id === t.dataset.ecat)));
  on(el, 'click', '#nprod', () => formProducto(null));
  on(el, 'click', '[data-ep]', (_e, t) => formProducto(cache.productos.find(p => p.id === t.dataset.ep)));
  on(el, 'click', '[data-ag]', async (_e, t) => {
    const p = cache.productos.find(x => x.id === t.dataset.ag); if (!p) return;
    try {
      const b = writeBatch(db); b.update(doc(db, 'productos', p.id), { agotado: !p.agotado });
      auditar(b, p.agotado ? 'producto.disponible' : 'producto.agotado', 'producto', p.id, p.nombre); await b.commit();
    } catch { toast('No se pudo cambiar', 'error'); }
  });
  return off;
}

function formCategoria(c) {
  openModal({
    title: c ? 'Editar categoría' : 'Nueva categoría',
    content: html`<form id="f">
      <label class="field"><span>Nombre</span><input type="text" name="nombre" required maxlength="40" value="${c?.nombre || ''}"></label>
      <label class="field"><span>Orden (menor aparece primero)</span><input type="number" name="orden" value="${c?.orden ?? cache.categorias.length + 1}"></label>
      <label class="row gap"><input type="checkbox" name="activa" ${c?.activa === false ? '' : 'checked'}> Visible para clientes</label>
      <div class="row between mt">${c ? html`<button type="button" class="btn danger" id="del">Eliminar</button>` : html`<span></span>`}<button class="btn primary">Guardar</button></div></form>`,
    onMount: (box, close) => {
      box.querySelector('#f').addEventListener('submit', async e => {
        e.preventDefault(); const fd = new FormData(e.target);
        const id = c?.id || randomId(10, 'abcdefghijkmnpqrstuvwxyz23456789');
        try {
          const b = writeBatch(db);
          b.set(doc(db, 'categorias', id), { nombre: fd.get('nombre').trim(), orden: numero(fd.get('orden')), activa: fd.get('activa') === 'on' }, { merge: true });
          auditar(b, c ? 'categoria.editar' : 'categoria.crear', 'categoria', id, fd.get('nombre')); await b.commit(); close();
        } catch { toast('No se pudo guardar', 'error'); }
      });
      box.querySelector('#del')?.addEventListener('click', async () => {
        if (cache.productos.some(p => p.categoriaId === c.id)) return toast('Mueve o elimina primero los productos de esta categoría.', 'error', 5000);
        if (!await confirmar(`¿Eliminar la categoría «${c.nombre}»?`, { ok: 'Eliminar', peligro: true })) return;
        try { const b = writeBatch(db); b.delete(doc(db, 'categorias', c.id)); auditar(b, 'categoria.eliminar', 'categoria', c.id, c.nombre); await b.commit(); close(); }
        catch { toast('No se pudo eliminar', 'error'); }
      });
    }
  });
}

function formProducto(p) {
  let imagen = p?.imagen || '';
  const variantesTxt = (p?.variantes || []).map(v => `${v.nombre} = ${v.precio}`).join('\n');
  openModal({
    title: p ? 'Editar producto' : 'Nuevo producto', wide: true,
    content: html`<form id="f">
      <div class="grid2">
        <label class="field"><span>Nombre</span><input type="text" name="nombre" required maxlength="80" value="${p?.nombre || ''}"></label>
        <label class="field"><span>Categoría</span><select name="categoriaId" required>
          <option value="">— elige —</option>${cache.categorias.map(c => html`<option value="${c.id}" ${p?.categoriaId === c.id ? 'selected' : ''}>${c.nombre}</option>`)}</select></label>
      </div>
      <label class="field"><span>Descripción</span><textarea name="descripcion" rows="2" maxlength="240">${p?.descripcion || ''}</textarea></label>
      <div class="grid2">
        <label class="field"><span>Precio base (COP)</span><input type="number" name="precio" min="0" step="100" required inputmode="numeric" value="${p?.precio ?? ''}"></label>
        <label class="field"><span>Orden</span><input type="number" name="orden" value="${p?.orden ?? 0}"></label>
      </div>
      <label class="field"><span>Opciones con precio propio (una por línea: «Nombre = precio»). Déjalo vacío si no hay.</span>
        <textarea name="variantes" rows="3" placeholder="Pequeño = 12000&#10;Grande = 18000">${variantesTxt}</textarea></label>
      <div class="field"><span>Etiquetas</span><div class="checks">${ETIQUETAS.map(t => html`<label><input type="checkbox" name="et" value="${t}" ${(p?.etiquetas || []).includes(t) ? 'checked' : ''}> ${t}</label>`)}</div></div>
      <div class="field"><span>Imagen</span>
        <div class="row gap"><img id="prev" class="thumb" style="width:72px;height:72px" src="${imagen ? imgUrl(imagen, 160) : ''}" alt="" ${imagen ? '' : 'hidden'}>
        <input type="file" id="file" accept="image/jpeg,image/png,image/webp"><span id="subiendo" class="muted small" hidden>Subiendo…</span></div></div>
      <div class="row gap wrap"><label class="row gap"><input type="checkbox" name="activo" ${p?.activo === false ? '' : 'checked'}> Visible para clientes</label>
        <label class="row gap"><input type="checkbox" name="agotado" ${p?.agotado ? 'checked' : ''}> Agotado</label></div>
      <p class="err" id="err" hidden></p>
      <div class="row between mt">${p ? html`<button type="button" class="btn danger" id="del">Eliminar</button>` : html`<span></span>`}<button class="btn primary" id="guardar">Guardar</button></div>
    </form>`,
    onMount: (box, close) => {
      const err = box.querySelector('#err');
      box.querySelector('#file').addEventListener('change', async e => {
        const f = e.target.files[0]; if (!f) return;
        const s = box.querySelector('#subiendo'); s.hidden = false; box.querySelector('#guardar').disabled = true;
        try {
          imagen = await subirImagen(f, { max: 1200 });
          const pv = box.querySelector('#prev'); pv.src = imgUrl(imagen, 160); pv.hidden = false;
        } catch (ex) { err.hidden = false; err.textContent = ex.message; }
        s.hidden = true; box.querySelector('#guardar').disabled = false;
      });
      box.querySelector('#f').addEventListener('submit', async e => {
        e.preventDefault(); err.hidden = true;
        const fd = new FormData(e.target);
        const variantes = [];
        for (const linea of String(fd.get('variantes') || '').split('\n').map(s => s.trim()).filter(Boolean)) {
          const [n, pr] = linea.split('=');
          if (!n || !pr || !(numero(pr) >= 0)) { err.hidden = false; err.textContent = `Línea de opciones no válida: «${linea}»`; return; }
          variantes.push({ nombre: n.trim().slice(0, 40), precio: numero(pr) });
        }
        const id = p?.id || randomId(12, 'abcdefghijkmnpqrstuvwxyz23456789');
        const datos = {
          nombre: fd.get('nombre').trim(), descripcion: (fd.get('descripcion') || '').trim(), categoriaId: fd.get('categoriaId'),
          precio: numero(fd.get('precio')), orden: numero(fd.get('orden')), variantes, etiquetas: fd.getAll('et'),
          imagen, activo: fd.get('activo') === 'on', agotado: fd.get('agotado') === 'on'
        };
        try {
          const b = writeBatch(db); b.set(doc(db, 'productos', id), datos, { merge: true });
          auditar(b, p ? 'producto.editar' : 'producto.crear', 'producto', id, datos.nombre); await b.commit(); close(); toast('Producto guardado', 'ok');
        } catch { err.hidden = false; err.textContent = 'No se pudo guardar.'; }
      });
      box.querySelector('#del')?.addEventListener('click', async () => {
        if (!await confirmar(`¿Eliminar «${p.nombre}»? Si solo quieres ocultarlo, desmarca «Visible».`, { ok: 'Eliminar', peligro: true })) return;
        try { const b = writeBatch(db); b.delete(doc(db, 'productos', p.id)); auditar(b, 'producto.eliminar', 'producto', p.id, p.nombre); await b.commit(); close(); }
        catch { toast('No se pudo eliminar', 'error'); }
      });
    }
  });
}
