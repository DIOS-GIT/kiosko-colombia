// Primera vez: crea el administrador y los datos básicos del sitio.
import { html, render, on, go, toast } from '../util.js';
import { S } from '../session.js';
import { auth, db, createUserWithEmailAndPassword, doc, setDoc, writeBatch, serverTimestamp } from '../fb.js';

export default function setup(_p, _q, root) {
  function pintar() {
    if (S.configurado) {
      render(root, html`<div class="login-wrap"><div class="card login-card"><h2>Ya está configurado</h2>
        <p>Este sitio ya tiene administrador.</p><a class="btn primary" href="#/login">Ir al acceso</a></div></div>`);
      return;
    }
    const soloFinalizar = S.rol === 'admin';
    render(root, html`<div class="login-wrap"><div class="card login-card">
      <h2>Configuración inicial</h2>
      <p class="muted small">${soloFinalizar ? 'Tu cuenta de administrador ya existe. Falta guardar los datos del local.' : 'Crea la cuenta del administrador (dueño). Hazlo ahora mismo: solo funciona mientras el sitio no esté configurado.'}</p>
      <form id="f">
        <label class="field"><span>Nombre del restaurante</span><input type="text" name="sitio" required maxlength="60" value="Kiosko Colombia"></label>
        ${soloFinalizar ? '' : html`
          <label class="field"><span>Tu nombre</span><input type="text" name="nombre" required maxlength="60" autocomplete="name"></label>
          <label class="field"><span>Correo</span><input type="email" name="email" required autocomplete="username"></label>
          <label class="field"><span>Contraseña (mínimo 8)</span><input type="password" name="pass" required minlength="8" autocomplete="new-password"></label>`}
        <p class="err" id="err" hidden></p>
        <button class="btn primary block" id="go">${soloFinalizar ? 'Terminar' : 'Crear administrador'}</button>
      </form>
    </div></div>`);
  }
  pintar();

  root.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const err = root.querySelector('#err'), btn = root.querySelector('#go');
    err.hidden = true; btn.disabled = true;
    try {
      if (S.rol !== 'admin') {
        // Paso 1: cuenta + perfil de administrador (las reglas lo permiten solo si aún no hay sitio)
        const cred = await createUserWithEmailAndPassword(auth, fd.email.trim(), fd.pass);
        await setDoc(doc(db, 'usuarios', cred.user.uid), {
          nombre: fd.nombre.trim(), email: fd.email.trim(), rol: 'admin', activo: true, creadoEn: serverTimestamp()
        });
        S.rol = 'admin'; S.nombre = fd.nombre.trim(); S.user = cred.user;
      }
      // Paso 2: datos del sitio y estado de caja (ya como admin)
      const b = writeBatch(db);
      b.set(doc(db, 'config', 'sitio'), {
        nombre: fd.sitio.trim(), eslogan: 'Sabor de la costa, hecho con cariño.',
        colorPrimario: '#0b8a9a', colorAcento: '#f7b32b', tarifaDomicilio: 5000, creadoEn: serverTimestamp()
      });
      b.set(doc(db, 'config', 'estado'), { abierto: false, turnoId: null, pedidosEnLinea: true });
      await b.commit();
      toast('¡Listo! Bienvenido.', 'ok');
      setTimeout(() => { location.hash = '#/panel'; location.reload(); }, 600);
    } catch (ex) {
      console.error(ex);
      btn.disabled = false;
      err.hidden = false;
      err.textContent = ex.code === 'auth/email-already-in-use' ? 'Ese correo ya existe. Entra desde «Personal».'
        : ex.code === 'permission-denied' ? 'Permiso denegado. ¿Publicaste las reglas de Firestore (firestore.rules)?'
        : ex.code === 'auth/operation-not-allowed' ? 'Activa «Correo/contraseña» en Authentication → Sign-in method.'
        : (ex.message || 'No se pudo completar.');
    }
  });
}
