// Equipo fijo: el administrador crea cuentas, asigna roles y desactiva personas.
import { html, render, on, toast, openModal, confirmar, fmtDateTime } from '../../util.js';
import { S, auditar, ROLES } from '../../session.js';
import { db, doc, writeBatch, setDoc, serverTimestamp, collection, onSnapshot, authSecundario, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from '../../fb.js';

export default function equipo(el) {
  let lista = [];
  function pintar() {
    render(el, html`
      <div class="page-h"><h2>Equipo</h2><button class="btn primary" id="nuevo">+ Nuevo empleado</button></div>
      <p class="muted small">Cada persona entra con su correo y contraseña. Tú decides su rol. Para refuerzos de un solo día usa «Temporales».</p>
      <div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>
        ${lista.map(u => html`<tr><td><b>${u.nombre}</b>${u.id === S.user.uid ? html` <span class="badge">tú</span>` : ''}</td><td>${u.email}</td><td>${ROLES[u.rol] || u.rol}</td>
          <td><span class="badge ${u.activo ? 'ok' : 'gray'}">${u.activo ? 'Activo' : 'Desactivado'}</span></td>
          <td class="num">${u.id !== S.user.uid ? html`<button class="btn sm" data-e="${u.id}">Editar</button>` : ''}</td></tr>`)}
      </tbody></table></div>`);
  }
  const off = onSnapshot(collection(db, 'usuarios'), s => {
    lista = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))); pintar();
  }, e => { console.warn(e); toast('No se pudo leer el equipo', 'error'); });
  pintar();

  on(el, 'click', '#nuevo', () => openModal({
    title: 'Nuevo empleado',
    content: html`<form id="f">
      <label class="field"><span>Nombre</span><input type="text" name="nombre" required maxlength="60"></label>
      <label class="field"><span>Correo</span><input type="email" name="email" required autocomplete="off"></label>
      <label class="field"><span>Contraseña inicial (mín. 8)</span><input type="text" name="pass" required minlength="8" autocomplete="off"></label>
      <label class="field"><span>Rol</span><select name="rol">${Object.entries(ROLES).filter(([k]) => k !== 'admin').map(([k, v]) => html`<option value="${k}">${v}</option>`)}<option value="admin">${ROLES.admin} (acceso total)</option></select></label>
      <p class="err" id="err" hidden></p><button class="btn primary block">Crear cuenta</button></form>`,
    onMount: (box, close) => box.querySelector('#f').addEventListener('submit', async e => {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries());
      const btn = e.target.querySelector('button'); btn.disabled = true;
      try {
        const sec = authSecundario();
        const cred = await createUserWithEmailAndPassword(sec, fd.email.trim(), fd.pass);
        await signOut(sec);
        const b = writeBatch(db);
        b.set(doc(db, 'usuarios', cred.user.uid), { nombre: fd.nombre.trim(), email: fd.email.trim(), rol: fd.rol, activo: true, creadoPor: S.user.uid, creadoEn: serverTimestamp() });
        auditar(b, 'usuario.crear', 'usuario', cred.user.uid, `${fd.nombre} (${fd.rol})`);
        await b.commit(); close(); toast('Cuenta creada. Entrégale el correo y la contraseña.', 'ok', 6000);
      } catch (ex) {
        console.error(ex); btn.disabled = false; const er = box.querySelector('#err'); er.hidden = false;
        er.textContent = ex.code === 'auth/email-already-in-use' ? 'Ese correo ya tiene cuenta.' : ex.code === 'auth/weak-password' ? 'Contraseña muy débil.' : 'No se pudo crear la cuenta.';
      }
    })
  }));

  on(el, 'click', '[data-e]', (_e, t) => {
    const u = lista.find(x => x.id === t.dataset.e); if (!u) return;
    openModal({
      title: `Editar a ${u.nombre}`,
      content: html`<form id="f">
        <label class="field"><span>Nombre</span><input type="text" name="nombre" required maxlength="60" value="${u.nombre}"></label>
        <label class="field"><span>Rol</span><select name="rol">${Object.entries(ROLES).map(([k, v]) => html`<option value="${k}" ${u.rol === k ? 'selected' : ''}>${v}</option>`)}</select></label>
        <label class="row gap"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Cuenta activa</label>
        <div class="row between mt"><button type="button" class="btn" id="reset">Enviar cambio de contraseña</button><button class="btn primary">Guardar</button></div></form>`,
      onMount: (box, close) => {
        box.querySelector('#reset').onclick = async () => {
          try { await sendPasswordResetEmail((await import('../../fb.js')).auth, u.email); toast('Correo enviado', 'ok'); } catch { toast('No se pudo enviar', 'error'); }
        };
        box.querySelector('#f').addEventListener('submit', async e => {
          e.preventDefault(); const fd = new FormData(e.target);
          try {
            const b = writeBatch(db);
            b.update(doc(db, 'usuarios', u.id), { nombre: fd.get('nombre').trim(), rol: fd.get('rol'), activo: fd.get('activo') === 'on' });
            auditar(b, 'usuario.editar', 'usuario', u.id, `${fd.get('nombre')} → ${fd.get('rol')} ${fd.get('activo') === 'on' ? 'activo' : 'desactivado'}`);
            await b.commit(); close(); toast('Guardado', 'ok');
          } catch { toast('No se pudo guardar', 'error'); }
        });
      }
    });
  });
  return off;
}
