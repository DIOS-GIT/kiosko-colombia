// Acceso del personal: correo/contraseña o código de empleado temporal (texto o QR).
import { html, render, on, go, toast, loadScript } from '../util.js';
import { S, loginStaff, canjearCodigo, logout } from '../session.js';
import { auth, sendPasswordResetEmail } from '../fb.js';

const MENSAJES = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet.',
  'auth/user-disabled': 'Esta cuenta está desactivada.'
};

export default function login(_p, _q, root) {
  if (S.rol) { go('/panel', true); return; }
  let tab = 'personal', scanner = null;

  async function pararScan() { if (scanner) { try { await scanner.stop(); scanner.clear(); } catch { /* ignora */ } scanner = null; } }

  function pintar() {
    render(root, html`<div class="login-wrap"><div class="card login-card">
      <a href="#/" class="small">← Volver a la carta</a>
      <h2 class="mt">Acceso del personal</h2>
      <div class="tabs">
        <button class="btn sm ${tab === 'personal' ? 'primary' : ''}" data-tab="personal">Mi cuenta</button>
        <button class="btn sm ${tab === 'codigo' ? 'primary' : ''}" data-tab="codigo">Código temporal</button>
      </div>
      ${tab === 'personal' ? html`
        <form id="fl">
          <label class="field"><span>Correo</span><input type="email" name="email" required autocomplete="username"></label>
          <label class="field"><span>Contraseña</span><input type="password" name="pass" required autocomplete="current-password"></label>
          <p class="err" id="err" hidden></p>
          <button class="btn primary block" id="go">Entrar</button>
          <p class="center small mt"><a href="#" id="olvide">Olvidé mi contraseña</a></p>
        </form>` : html`
        <form id="fc">
          <p class="muted small">Tu gerente de turno te dará un código o un QR. Funciona una sola vez y termina al cerrar la caja.</p>
          <label class="field"><span>Código</span><input type="text" name="codigo" required autocapitalize="characters" autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX" style="letter-spacing:.12em;text-transform:uppercase"></label>
          <p class="err" id="err" hidden></p>
          <button class="btn primary block" id="go">Entrar con código</button>
          <button type="button" class="btn block mt" id="scan">📷 Escanear QR</button>
          <div id="reader" class="scan-box mt"></div>
        </form>`}
    </div></div>`);
  }
  pintar();

  const falla = m => { const e = root.querySelector('#err'); if (e) { e.textContent = m; e.hidden = false; } };

  on(root, 'click', '[data-tab]', async (_e, t) => { await pararScan(); tab = t.dataset.tab; pintar(); });

  root.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const btn = root.querySelector('#go'); btn.disabled = true;
    try {
      if (e.target.id === 'fl') {
        await loginStaff(fd.email.trim(), fd.pass);
        // onAuthStateChanged resuelve el rol en segundo plano: esperamos hasta 8 s a que aparezca
        for (let i = 0; i < 53 && !S.rol; i++) await new Promise(r => setTimeout(r, 150));
        if (!S.rol) { await logout(); throw Object.assign(new Error('x'), { code: 'sin-perfil' }); }
        go('/panel', true);
      } else {
        await canjearCodigo(fd.codigo);
        go('/panel', true);
      }
    } catch (ex) {
      btn.disabled = false;
      falla(ex.code === 'sin-perfil'
        ? 'Tu cuenta existe pero no tiene acceso activo. Pide al administrador que la active.'
        : (MENSAJES[ex.code] || ex.message || 'No se pudo entrar.'));
    }
  });

  on(root, 'click', '#olvide', async e => {
    e.preventDefault();
    const email = root.querySelector('[name=email]').value.trim();
    if (!email) return falla('Escribe tu correo arriba y vuelve a pulsar.');
    try { await sendPasswordResetEmail(auth, email); toast('Te enviamos un correo para cambiar la contraseña.', 'ok', 6000); }
    catch { toast('No se pudo enviar el correo.', 'error'); }
  });

  on(root, 'click', '#scan', async () => {
    if (scanner) { await pararScan(); return; }
    try {
      await loadScript('vendor/html5-qrcode.min.js');
      scanner = new window.Html5Qrcode('reader');
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 230 }, async texto => {
        const m = String(texto).match(/#\/t\/([A-Za-z0-9-]+)/) || [null, texto];
        await pararScan();
        try { await canjearCodigo(m[1]); go('/panel', true); } catch (ex) { falla(ex.message); }
      });
    } catch (ex) { falla('No se pudo abrir la cámara. Escribe el código a mano.'); scanner = null; }
  });

  return () => { pararScan(); };
}

// /t/CODIGO → canje directo (el QR del gerente abre esta dirección)
export async function codigoDirecto({ codigo }, _q, root) {
  render(root, html`<div class="splash"><div class="spinner"></div><p>Activando tu acceso…</p></div>`);
  try {
    if (S.rol && !S.temporal) throw new Error('Ya tienes una sesión de personal abierta.');
    if (!S.temporal) await canjearCodigo(codigo);
    go('/panel', true);
  } catch (ex) {
    render(root, html`<div class="login-wrap"><div class="card login-card"><h2>No se pudo activar</h2>
      <p>${ex.message}</p><a class="btn primary" href="#/login">Ir al acceso</a></div></div>`);
  }
}
