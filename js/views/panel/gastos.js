// Gastos: registro de egresos del negocio (compras, servicios, nómina, etc.).
import { html, render, on, toast, openModal, confirmar, numero, money, fmtDateTime, randomId } from '../../util.js';
import { S, auditar } from '../../session.js';
import { db, doc, writeBatch, serverTimestamp, collection, query, orderBy, limit, onSnapshot } from '../../fb.js';

const CATEGORIAS = ['Insumos', 'Servicios', 'Nómina', 'Arriendo', 'Mantenimiento', 'Publicidad', 'Otros'];

export default function gastos(el) {
  const admin = S.rol === 'admin';
  let lista = [];
  function pintar() {
    const hoy = new Date().toDateString();
    const totalHoy = lista.filter(g => g.fecha?.toDate?.().toDateString() === hoy).reduce((a, g) => a + (g.monto || 0), 0);
    render(el, html`
      <div class="page-h"><h2>Gastos</h2><button class="btn primary" id="nuevo">+ Registrar gasto</button></div>
      <div class="stats"><div class="stat"><div class="n">${money(totalHoy)}</div><div class="l">Gastos de hoy</div></div>
        <div class="stat"><div class="n">${money(lista.reduce((a, g) => a + (g.monto || 0), 0))}</div><div class="l">Últimos ${lista.length} registros</div></div></div>
      ${lista.length ? html`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Registró</th><th class="num">Monto</th><th></th></tr></thead><tbody>
        ${lista.map(g => html`<tr><td>${fmtDateTime(g.fecha)}</td><td>${g.concepto}</td><td><span class="badge gray">${g.categoria}</span></td><td>${g.registradoNombre || ''}</td>
          <td class="num"><b>${money(g.monto)}</b></td>
          <td class="num">${admin ? html`<button class="btn sm ghost" data-del="${g.id}">Borrar</button>` : ''}</td></tr>`)}
      </tbody></table></div>` : html`<div class="empty">Sin gastos registrados.</div>`}`);
  }
  const off = onSnapshot(query(collection(db, 'gastos'), orderBy('fecha', 'desc'), limit(100)), s => {
    lista = s.docs.map(d => ({ id: d.id, ...d.data() })); pintar();
  }, e => { console.warn(e); toast('No se pudieron leer los gastos', 'error'); });
  pintar();

  on(el, 'click', '#nuevo', () => openModal({
    title: 'Registrar gasto',
    content: html`<form id="f">
      <label class="field"><span>Concepto</span><input type="text" name="concepto" required maxlength="100"></label>
      <div class="grid2"><label class="field"><span>Monto (COP)</span><input type="number" name="monto" min="1" required inputmode="numeric"></label>
      <label class="field"><span>Categoría</span><select name="categoria">${CATEGORIAS.map(c => html`<option>${c}</option>`)}</select></label></div>
      <p class="err" id="err" hidden></p><button class="btn primary block">Guardar</button></form>`,
    onMount: (box, close) => box.querySelector('#f').addEventListener('submit', async e => {
      e.preventDefault(); const fd = new FormData(e.target); const m = numero(fd.get('monto'));
      if (m <= 0) return;
      try {
        const id = randomId(14, 'abcdefghijkmnpqrstuvwxyz23456789');
        const b = writeBatch(db);
        b.set(doc(db, 'gastos', id), {
          concepto: fd.get('concepto').trim(), monto: m, categoria: fd.get('categoria'),
          turnoId: S.estado.abierto ? S.estado.turnoId : null, fecha: serverTimestamp(),
          registradoPor: S.user.uid, registradoNombre: S.nombre
        });
        auditar(b, 'gasto.crear', 'gasto', id, `${fd.get('concepto')} $${m}`); await b.commit(); close(); toast('Gasto registrado', 'ok');
      } catch { const er = box.querySelector('#err'); er.hidden = false; er.textContent = 'No se pudo guardar.'; }
    })
  }));
  on(el, 'click', '[data-del]', async (_e, t) => {
    const g = lista.find(x => x.id === t.dataset.del); if (!g) return;
    if (!await confirmar(`¿Borrar el gasto «${g.concepto}» (${money(g.monto)})?`, { ok: 'Borrar', peligro: true })) return;
    try { const b = writeBatch(db); b.delete(doc(db, 'gastos', g.id)); auditar(b, 'gasto.borrar', 'gasto', g.id, `${g.concepto} $${g.monto}`); await b.commit(); }
    catch { toast('No se pudo borrar', 'error'); }
  });
  return off;
}
