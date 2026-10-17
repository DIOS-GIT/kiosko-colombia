// Inventario simple: stock, mínimos y ajustes (cada ajuste queda en auditoría).
import { html, render, on, toast, openModal, confirmar, numero, randomId, money, esc } from '../../util.js';
import { S, auditar } from '../../session.js';
import { db, doc, writeBatch, collection, onSnapshot, increment } from '../../fb.js';

export default function inventario(el) {
  const admin = S.rol === 'admin';
  let lista = [];
  function pintar() {
    const bajos = lista.filter(i => i.stock <= i.stockMinimo);
    render(el, html`
      <div class="page-h"><h2>Inventario</h2>${admin ? html`<button class="btn primary" id="nuevo">+ Insumo</button>` : ''}</div>
      ${bajos.length ? html`<div class="banner">⚠️ Stock bajo: ${bajos.map(i => i.nombre).join(', ')}</div>` : ''}
      ${lista.length ? html`<div class="table-wrap"><table><thead><tr><th>Insumo</th><th class="num">Stock</th><th class="num">Mínimo</th><th class="num">Costo</th><th></th></tr></thead><tbody>
        ${lista.map(i => html`<tr><td><b>${i.nombre}</b></td>
          <td class="num"><span class="badge ${i.stock <= i.stockMinimo ? 'err' : 'ok'}">${i.stock} ${i.unidad}</span></td>
          <td class="num">${i.stockMinimo}</td><td class="num">${i.costo ? money(i.costo) : '—'}</td>
          <td class="num"><button class="btn sm" data-aj="${i.id}">Ajustar</button>${admin ? html` <button class="btn sm" data-ed="${i.id}">Editar</button>` : ''}</td></tr>`)}
      </tbody></table></div>` : html`<div class="empty">Sin insumos todavía.</div>`}`);
  }
  const off = onSnapshot(collection(db, 'inventario'), s => {
    lista = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))); pintar();
  }, e => { console.warn(e); toast('No se pudo leer el inventario', 'error'); });
  pintar();

  on(el, 'click', '#nuevo', () => form(null));
  on(el, 'click', '[data-ed]', (_e, t) => form(lista.find(i => i.id === t.dataset.ed)));
  on(el, 'click', '[data-aj]', (_e, t) => {
    const i = lista.find(x => x.id === t.dataset.aj); if (!i) return;
    openModal({
      title: `Ajustar ${i.nombre}`,
      content: html`<p>Stock actual: <b>${i.stock} ${i.unidad}</b></p><form id="f">
        <label class="field"><span>Cantidad (usa negativo para restar)</span><input type="number" name="d" step="any" required></label>
        <label class="field"><span>Motivo</span><select name="m"><option>Compra</option><option>Consumo</option><option>Merma / daño</option><option>Conteo físico</option></select></label>
        <button class="btn primary block">Aplicar</button></form>`,
      onMount: (box, close) => box.querySelector('#f').addEventListener('submit', async e => {
        e.preventDefault(); const fd = new FormData(e.target); const d = numero(fd.get('d'));
        if (!d) return;
        if (i.stock + d < 0) return toast('No puede quedar en negativo.', 'error');
        try {
          const b = writeBatch(db); b.update(doc(db, 'inventario', i.id), { stock: increment(d) });
          auditar(b, 'inventario.ajuste', 'insumo', i.id, `${i.nombre} ${d > 0 ? '+' : ''}${d} ${i.unidad} (${fd.get('m')})`); await b.commit(); close();
        } catch { toast('No se pudo ajustar', 'error'); }
      })
    });
  });

  function form(i) {
    openModal({
      title: i ? 'Editar insumo' : 'Nuevo insumo',
      content: html`<form id="f">
        <label class="field"><span>Nombre</span><input type="text" name="nombre" required maxlength="60" value="${i?.nombre || ''}"></label>
        <div class="grid2"><label class="field"><span>Unidad</span><input type="text" name="unidad" required maxlength="12" placeholder="kg, und, lt…" value="${i?.unidad || ''}"></label>
        <label class="field"><span>Stock</span><input type="number" name="stock" step="any" min="0" required value="${i?.stock ?? 0}"></label>
        <label class="field"><span>Stock mínimo</span><input type="number" name="min" step="any" min="0" value="${i?.stockMinimo ?? 0}"></label>
        <label class="field"><span>Costo por unidad</span><input type="number" name="costo" min="0" value="${i?.costo ?? 0}"></label></div>
        <div class="row between mt">${i ? html`<button type="button" class="btn danger" id="del">Eliminar</button>` : html`<span></span>`}<button class="btn primary">Guardar</button></div></form>`,
      onMount: (box, close) => {
        box.querySelector('#f').addEventListener('submit', async e => {
          e.preventDefault(); const fd = new FormData(e.target);
          const id = i?.id || randomId(10, 'abcdefghijkmnpqrstuvwxyz23456789');
          try {
            const b = writeBatch(db);
            b.set(doc(db, 'inventario', id), { nombre: fd.get('nombre').trim(), unidad: fd.get('unidad').trim(), stock: numero(fd.get('stock')), stockMinimo: numero(fd.get('min')), costo: numero(fd.get('costo')) }, { merge: true });
            auditar(b, i ? 'insumo.editar' : 'insumo.crear', 'insumo', id, fd.get('nombre')); await b.commit(); close();
          } catch { toast('No se pudo guardar', 'error'); }
        });
        box.querySelector('#del')?.addEventListener('click', async () => {
          if (!await confirmar(`¿Eliminar «${i.nombre}»?`, { ok: 'Eliminar', peligro: true })) return;
          try { const b = writeBatch(db); b.delete(doc(db, 'inventario', i.id)); auditar(b, 'insumo.eliminar', 'insumo', i.id, i.nombre); await b.commit(); close(); }
          catch { toast('No se pudo eliminar', 'error'); }
        });
      }
    });
  }
  return off;
}
