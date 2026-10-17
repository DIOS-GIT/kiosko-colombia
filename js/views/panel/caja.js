// Caja: abrir y cerrar turno. Al cerrar, todos los accesos temporales del turno terminan.
import { html, render, on, money, numero, randomId, toast, openModal, confirmar, fmtDateTime, esc } from '../../util.js';
import { S, auditar, onChange } from '../../session.js';
import { db, doc, getDoc, writeBatch, serverTimestamp, collection, query, where, getDocs } from '../../fb.js';
import { suscribirPedidos } from '../../pedidosStore.js';
import { resumenTurno } from './dash.js';
import { ESTADOS_ACTIVOS } from '../../data.js';

export default function caja(el) {
  let lista = [], turno = null;

  async function pintar() {
    const abierto = S.estado.abierto && S.estado.turnoId;
    if (!abierto) {
      render(el, html`<div class="page-h"><h2>Caja y turno</h2></div>
        <div class="card" style="max-width:460px"><h3>Abrir caja</h3>
          <p class="muted small">Al abrir el turno se habilitan los pedidos en línea y los accesos temporales.</p>
          <form id="fa"><label class="field"><span>Efectivo inicial en caja</span><input type="number" name="inicial" min="0" step="500" value="0" inputmode="numeric" required></label>
          <p class="err" id="err" hidden></p><button class="btn primary block">Abrir caja</button></form></div>`);
      return;
    }
    const r = resumenTurno(lista);
    const pendientes = lista.filter(p => ESTADOS_ACTIVOS.includes(p.estado));
    render(el, html`<div class="page-h"><h2>Caja y turno</h2><span class="badge ok">Abierta</span></div>
      <div class="stats">
        <div class="stat"><div class="n">${money(r.ventas)}</div><div class="l">Ventas cobradas (${r.n})</div></div>
        <div class="stat"><div class="n">${money(r.efectivo)}</div><div class="l">Efectivo cobrado</div></div>
        <div class="stat"><div class="n">${money(r.electronico)}</div><div class="l">Electrónico</div></div>
        <div class="stat"><div class="n">${money(r.contraentrega)}</div><div class="l">Contraentrega</div></div>
        <div class="stat"><div class="n">${pendientes.length}</div><div class="l">Pedidos sin cerrar</div></div>
      </div>
      <div class="card mb"><h3>Pedidos en línea</h3>
        <label class="row gap"><input type="checkbox" id="enl" ${S.estado.pedidosEnLinea !== false ? 'checked' : ''}> Recibiendo pedidos de clientes (QR y web)</label>
        <p class="muted small">Desactívalo si la cocina está saturada. Los clientes verán «pedidos cerrados por ahora».</p></div>
      <div class="card" style="max-width:520px"><h3>Cerrar caja</h3>
        ${pendientes.length ? html`<div class="banner">Hay ${pendientes.length} pedido(s) sin cerrar: ${pendientes.map(p => p.codigo).join(', ')}. Cóbralos o anúlalos antes de cerrar.</div>` : ''}
        <form id="fc"><label class="field"><span>Efectivo contado en caja</span><input type="number" name="contado" min="0" step="100" inputmode="numeric" required></label>
          <label class="field"><span>Nota de cierre (opcional)</span><input type="text" name="nota" maxlength="200"></label>
          <p class="err" id="err" hidden></p><button class="btn danger block">Cerrar caja</button></form>
        <p class="muted small mt">Se cerrarán también los accesos de empleados temporales.</p></div>`);
  }

  const off1 = suscribirPedidos(l => { lista = l; pintar(); });
  const off2 = onChange(t => { if (t === 'estado') pintar(); });

  el.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const err = el.querySelector('#err'); const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      if (e.target.id === 'fa') {
        const id = randomId(16, 'abcdefghijkmnpqrstuvwxyz23456789');
        const b = writeBatch(db);
        b.set(doc(db, 'turnos', id), {
          estado: 'abierto', abiertoPor: S.user.uid, abiertoNombre: S.nombre, abiertoEn: serverTimestamp(), montoInicial: numero(fd.inicial)
        });
        b.set(doc(db, 'config', 'estado'), { abierto: true, turnoId: id, pedidosEnLinea: true }, { merge: true });
        auditar(b, 'caja.abrir', 'turno', id, `inicial $${numero(fd.inicial)}`);
        await b.commit(); toast('Caja abierta', 'ok');
      } else {
        const pend = lista.filter(p => ESTADOS_ACTIVOS.includes(p.estado));
        if (pend.length && !await confirmar(`Quedan ${pend.length} pedidos sin cerrar. Se quedarán así. ¿Cerrar la caja de todos modos?`, { ok: 'Cerrar igual', peligro: true })) { btn.disabled = false; return; }
        const r = resumenTurno(lista);
        const tid = S.estado.turnoId;
        let gastos = 0;
        try {
          const gs = await getDocs(query(collection(db, 'gastos'), where('turnoId', '==', tid)));
          gs.forEach(g => { gastos += Number(g.data().monto) || 0; });
        } catch { /* este rol no ve gastos */ }
        const t = (await getDoc(doc(db, 'turnos', tid))).data();
        const contado = numero(fd.contado);
        const esperado = (t.montoInicial || 0) + r.efectivo;
        const b = writeBatch(db);
        b.update(doc(db, 'turnos', tid), {
          estado: 'cerrado', cerradoPor: S.user.uid, cerradoNombre: S.nombre, cerradoEn: serverTimestamp(),
          efectivoContado: contado, efectivoEsperado: esperado, diferencia: contado - esperado, notaCierre: fd.nota || '',
          totales: { ventas: r.ventas, pedidos: r.n, efectivo: r.efectivo, electronico: r.electronico, contraentrega: r.contraentrega, ticket: Math.round(r.ticket), anulados: r.anulados, gastos }
        });
        b.set(doc(db, 'config', 'estado'), { abierto: false, turnoId: null }, { merge: true });
        auditar(b, 'caja.cerrar', 'turno', tid, `ventas $${r.ventas} · dif $${contado - esperado}`);
        await b.commit();
        const dif = contado - esperado;
        toast('Caja cerrada', 'ok');
        openModal({ title: 'Resumen del cierre', content: html`
          <div class="line"><span>Ventas cobradas</span><b>${money(r.ventas)}</b></div>
          <div class="line"><span>Efectivo esperado (inicial + cobrado)</span><b>${money(esperado)}</b></div>
          <div class="line"><span>Efectivo contado</span><b>${money(contado)}</b></div>
          <div class="line total"><span>Diferencia</span><span style="color:${dif === 0 ? 'var(--c-ok)' : 'var(--c-err)'}">${money(dif)}</span></div>
          ${gastos ? html`<p class="muted small">Gastos registrados en el turno: ${money(gastos)}</p>` : ''}`});
      }
    } catch (ex) {
      console.error(ex); btn.disabled = false;
      if (err) { err.hidden = false; err.textContent = ex.code === 'permission-denied' ? 'Sin permiso para esta acción.' : 'No se pudo completar. Intenta de nuevo.'; }
    }
  });

  el.addEventListener('change', async e => {
    if (e.target.id !== 'enl') return;
    try {
      const b = writeBatch(db);
      b.update(doc(db, 'config', 'estado'), { pedidosEnLinea: e.target.checked });
      auditar(b, 'caja.pedidos_en_linea', 'config', 'estado', String(e.target.checked));
      await b.commit();
    } catch { toast('No se pudo cambiar.', 'error'); e.target.checked = !e.target.checked; }
  });

  return () => { off1(); off2(); };
}
