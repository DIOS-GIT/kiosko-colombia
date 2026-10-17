// Mesas y códigos QR (generar, descargar, imprimir).
import { html, render, on, toast, openModal, confirmar, randomId, numero, esc, raw } from '../../util.js';
import { S, auditar } from '../../session.js';
import { cache, onCache } from '../../data.js';
import { db, doc, writeBatch, setDoc, updateDoc } from '../../fb.js';
import { qrDataUrl, urlMesa } from '../../qr.js';

export default function mesas(el) {
  const esAdmin = S.rol === 'admin';
  const qrs = {};

  async function pintar() {
    const lista = cache.mesas;
    await Promise.all(lista.map(async m => { if (!qrs[m.id]) { try { qrs[m.id] = await qrDataUrl(urlMesa(m.id), 400); } catch { qrs[m.id] = ''; } } }));
    render(el, html`
      <div class="page-h no-print"><h2>Mesas y QR</h2>
        <div class="row gap">${lista.length ? html`<button class="btn" id="imprimir">🖨️ Imprimir todos</button>` : ''}
        ${esAdmin ? html`<button class="btn primary" id="nueva">+ Nueva mesa</button>` : ''}</div></div>
      <p class="muted small no-print">Cada QR abre la carta ya sabiendo en qué mesa está el cliente. Imprímelo y pégalo en la mesa.</p>
      ${lista.length ? html`<div class="items print-grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">${lista.map(m => html`
        <div class="card mesa-card print-card ${m.activa === false ? 'muted' : ''}">
          <h3>Mesa ${m.numero}</h3><div class="muted small">${m.zona || ''}${m.capacidad ? ' · ' + m.capacidad + ' personas' : ''}</div>
          ${qrs[m.id] ? html`<img src="${qrs[m.id]}" alt="QR mesa ${m.numero}">` : ''}
          <div class="small muted no-print" style="word-break:break-all">${urlMesa(m.id)}</div>
          <div class="row gap wrap mt no-print" style="justify-content:center">
            <a class="btn sm" download="mesa-${m.numero}.png" href="${qrs[m.id] || '#'}">Descargar</a>
            ${esAdmin ? html`<button class="btn sm" data-edit="${m.id}">Editar</button>` : ''}
          </div>
          ${m.activa === false ? html`<span class="badge gray">Desactivada</span>` : ''}
        </div>`)}</div>` : html`<div class="empty">Aún no hay mesas.${esAdmin ? ' Crea la primera con «Nueva mesa».' : ''}</div>`}`);
  }
  pintar();
  const off = onCache(pintar);

  function formMesa(m) {
    openModal({
      title: m ? `Editar mesa ${m.numero}` : 'Nueva mesa',
      content: html`<form id="fm">
        <div class="grid2"><label class="field"><span>Número</span><input type="number" name="numero" min="1" required value="${m?.numero ?? (Math.max(0, ...cache.mesas.map(x => x.numero || 0)) + 1)}"></label>
        <label class="field"><span>Capacidad</span><input type="number" name="capacidad" min="1" max="30" value="${m?.capacidad ?? 4}"></label></div>
        <label class="field"><span>Zona (opcional)</span><input type="text" name="zona" maxlength="40" value="${m?.zona || ''}" placeholder="Terraza, salón, barra…"></label>
        <label class="row gap"><input type="checkbox" name="activa" ${m?.activa === false ? '' : 'checked'}> Activa</label>
        <p class="err" id="err" hidden></p>
        <div class="row between mt">${m ? html`<button type="button" class="btn danger" id="del">Eliminar</button>` : html`<span></span>`}
        <button class="btn primary">Guardar</button></div></form>`,
      onMount: (box, close) => {
        box.querySelector('#fm').addEventListener('submit', async e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const num = numero(fd.get('numero'));
          if (cache.mesas.some(x => x.numero === num && x.id !== m?.id)) { const er = box.querySelector('#err'); er.hidden = false; er.textContent = 'Ya existe una mesa con ese número.'; return; }
          const datos = { numero: num, capacidad: numero(fd.get('capacidad')), zona: (fd.get('zona') || '').trim(), activa: fd.get('activa') === 'on' };
          try {
            const id = m?.id || randomId(8, 'abcdefghijkmnpqrstuvwxyz23456789');
            const b = writeBatch(db);
            b.set(doc(db, 'mesas', id), datos, { merge: true });
            auditar(b, m ? 'mesa.editar' : 'mesa.crear', 'mesa', id, `mesa ${num}`);
            await b.commit(); close(); toast('Mesa guardada', 'ok');
          } catch { toast('No se pudo guardar', 'error'); }
        });
        box.querySelector('#del')?.addEventListener('click', async () => {
          if (!await confirmar(`¿Eliminar la mesa ${m.numero}? Su QR dejará de funcionar.`, { ok: 'Eliminar', peligro: true })) return;
          try {
            const b = writeBatch(db); b.delete(doc(db, 'mesas', m.id)); auditar(b, 'mesa.eliminar', 'mesa', m.id, `mesa ${m.numero}`); await b.commit();
            close(); toast('Mesa eliminada');
          } catch { toast('No se pudo eliminar', 'error'); }
        });
      }
    });
  }
  on(el, 'click', '#nueva', () => formMesa(null));
  on(el, 'click', '[data-edit]', (_e, t) => formMesa(cache.mesas.find(m => m.id === t.dataset.edit)));
  on(el, 'click', '#imprimir', () => window.print());
  return off;
}
