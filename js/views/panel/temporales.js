// Empleados temporales: los crea el gerente de turno. Duran hasta el cierre de caja o menos.
import { html, render, on, toast, openModal, randomId, fmtTime, confirmar, esc } from '../../util.js';
import { S, auditar, ROLES, ROLES_TEMP, onChange } from '../../session.js';
import { db, doc, writeBatch, serverTimestamp, Timestamp, query, collection, where, onSnapshot } from '../../fb.js';
import { qrDataUrl, urlCodigo } from '../../qr.js';

const formato = id => id.match(/.{1,4}/g).join('-');
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function calcularExpira(tipo) {
  const ahora = new Date();
  if (tipo === 'cierre') return new Date(ahora.getTime() + 23 * 3600e3); // el cierre de caja lo termina antes
  if (tipo === 'dia') { const f = new Date(); f.setHours(23, 59, 0, 0); if (f <= ahora) return new Date(ahora.getTime() + 3600e3); return f; }
  return new Date(ahora.getTime() + Number(tipo) * 3600e3);
}

export default function temporales(el) {
  let lista = [], unsub = null, turno = null;

  function escuchar() {
    const t = S.estado.abierto ? S.estado.turnoId : null;
    if (t === turno && (unsub || !t)) return;
    if (unsub) { unsub(); unsub = null; }
    turno = t; lista = [];
    if (t) unsub = onSnapshot(query(collection(db, 'sesiones_temporales'), where('turnoId', '==', t)),
      s => { lista = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0)); pintar(); },
      e => { console.warn(e); toast('No se pudo leer la lista.', 'error'); });
    pintar();
  }

  function pintar() {
    if (!S.estado.abierto) {
      render(el, html`<div class="page-h"><h2>Empleados temporales</h2></div><div class="banner">Abre la caja para poder crear accesos temporales. Terminan solos al cerrarla.</div>`); return;
    }
    if (S.temporal) { render(el, html`<div class="banner err">Un acceso temporal no puede crear otros accesos.</div>`); return; }
    const ahora = Date.now();
    const estadoDe = s => s.estado === 'revocada' ? ['Revocado', 'gray'] : s.estado === 'activa'
      ? ((s.expiraEn?.toDate?.() ?? 0) < ahora ? ['Vencido', 'gray'] : ['En turno', 'ok'])
      : ((s.canjeableHasta?.toDate?.() ?? 0) < ahora ? ['Sin usar · venció', 'gray'] : ['Esperando que entre', 'warn']);
    render(el, html`
      <div class="page-h"><h2>Empleados temporales</h2><button class="btn primary" id="nuevo">+ Nuevo acceso</button></div>
      <p class="muted small">Para reemplazos o refuerzos del día. El empleado entra con un código o QR de un solo uso, sin correo ni contraseña, y su acceso termina al cerrar la caja. Todo lo que haga queda a su nombre.</p>
      ${lista.length ? html`<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Vence</th><th></th></tr></thead><tbody>
        ${lista.map(s => { const [t, c] = estadoDe(s); return html`<tr><td><b>${s.nombre}</b><div class="muted small">creó ${s.creadoNombre || ''}</div></td><td>${ROLES[s.rol] || s.rol}</td>
          <td><span class="badge ${c}">${t}</span></td><td>${fmtTime(s.expiraEn)}</td>
          <td class="num">${s.estado !== 'revocada' ? html`<button class="btn sm danger" data-rev="${s.id}">Revocar</button>` : ''}</td></tr>`; })}
      </tbody></table></div>` : html`<div class="empty">No hay accesos temporales en este turno.</div>`}`);
  }

  const off = onChange(t => { if (t === 'estado') escuchar(); });
  escuchar();

  on(el, 'click', '[data-rev]', async (_e, t) => {
    const s = lista.find(x => x.id === t.dataset.rev); if (!s) return;
    if (!await confirmar(`¿Revocar el acceso de ${s.nombre}? Se cerrará su sesión de inmediato.`, { ok: 'Revocar', peligro: true })) return;
    try {
      const b = writeBatch(db); b.update(doc(db, 'sesiones_temporales', s.id), { estado: 'revocada', revocadoPor: S.user.uid });
      auditar(b, 'temporal.revocar', 'sesion_temporal', s.id, s.nombre); await b.commit(); toast('Acceso revocado', 'ok');
    } catch { toast('No se pudo revocar', 'error'); }
  });

  on(el, 'click', '#nuevo', () => openModal({
    title: 'Nuevo acceso temporal',
    content: html`<form id="f">
      <label class="field"><span>Nombre del empleado</span><input type="text" name="nombre" required minlength="2" maxlength="40"></label>
      <label class="field"><span>Rol</span><select name="rol">${ROLES_TEMP.map(r => html`<option value="${r}">${ROLES[r]}</option>`)}</select></label>
      <label class="field"><span>Vigencia</span><select name="vig">
        <option value="cierre">Hasta el cierre de caja</option><option value="dia">Hasta el final del día (11:59 pm)</option>
        <option value="4">4 horas</option><option value="8">8 horas</option></select></label>
      <p class="err" id="err" hidden></p><button class="btn primary block">Crear acceso</button></form>`,
    onMount: (box, close) => box.querySelector('#f').addEventListener('submit', async e => {
      e.preventDefault(); const fd = new FormData(e.target); const btn = e.target.querySelector('button'); btn.disabled = true;
      const id = randomId(16, ALFA);
      const exp = calcularExpira(fd.get('vig'));
      const canje = new Date(Date.now() + 15 * 60e3); // el código debe usarse en 15 minutos
      try {
        const b = writeBatch(db);
        b.set(doc(db, 'sesiones_temporales', id), {
          nombre: fd.get('nombre').trim(), rol: fd.get('rol'), turnoId: S.estado.turnoId, estado: 'pendiente',
          creadoPor: S.user.uid, creadoNombre: S.nombre, creadoEn: serverTimestamp(),
          expiraEn: Timestamp.fromDate(exp), canjeableHasta: Timestamp.fromDate(canje)
        });
        auditar(b, 'temporal.crear', 'sesion_temporal', id, `${fd.get('nombre')} (${fd.get('rol')})`);
        await b.commit(); close(); mostrarCodigo(id, fd.get('nombre'));
      } catch (ex) {
        console.error(ex); btn.disabled = false;
        const er = box.querySelector('#err'); er.hidden = false; er.textContent = 'No se pudo crear (¿la caja sigue abierta?).';
      }
    })
  }));

  return () => { off(); if (unsub) unsub(); };
}

async function mostrarCodigo(id, nombre) {
  let qr = ''; try { qr = await qrDataUrl(urlCodigo(id), 360); } catch { /* sin QR */ }
  openModal({
    title: `Acceso para ${nombre}`,
    content: html`<p class="muted small">Entrégale este código o QR a ${nombre}. <b>Sirve una sola vez y caduca en 15 minutos si no lo usa.</b></p>
      <div class="code-box">${formato(id)}</div>
      ${qr ? html`<img src="${qr}" alt="QR de acceso" style="margin:12px auto;max-width:240px">` : ''}
      <p class="small muted center">Debe entrar desde «Personal» → «Código temporal», o escanear el QR con la cámara.</p>
      <div class="row gap mt"><button class="btn block" id="cp">Copiar código</button><button class="btn block" id="cl">Copiar enlace</button></div>`,
    onMount: box => {
      box.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(formato(id)); toast('Código copiado', 'ok'); } catch { toast(formato(id)); } };
      box.querySelector('#cl').onclick = async () => { try { await navigator.clipboard.writeText(urlCodigo(id)); toast('Enlace copiado', 'ok'); } catch { toast(urlCodigo(id)); } };
    }
  });
}
