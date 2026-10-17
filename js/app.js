// Arranque de la aplicación y rutas.
import { estaConfigurado } from './config.js';
import { html, render, go } from './util.js';

const root = document.getElementById('app');

function pantallaConfig() {
  render(root, html`<div class="login-wrap"><div class="card login-card">
    <h2>Falta configurar Firebase</h2>
    <p>Abre <b>js/config.js</b> y pega los datos de tu proyecto de Firebase (y de Cloudinary).</p>
    <p class="muted small">La guía paso a paso está en el archivo <b>README.md</b>.</p>
  </div></div>`);
}

async function main() {
  if (!estaConfigurado()) { pantallaConfig(); return; }

  let mods;
  try {
    const [fb, session, router] = await Promise.all([import('./fb.js'), import('./session.js'), import('./router.js')]);
    mods = { session, router };
  } catch (e) {
    console.error(e);
    render(root, html`<div class="login-wrap"><div class="card login-card"><h2>Sin conexión</h2>
      <p>No se pudo cargar Firebase. Revisa tu internet e intenta de nuevo.</p>
      <button class="btn primary" onclick="location.reload()">Reintentar</button></div></div>`);
    return;
  }
  const { S, iniciarSesion, onChange } = mods.session;
  const { ruta, iniciarRouter, despachar } = mods.router;

  await iniciarSesion();

  if (S.authError) {
    const c = S.authError.code || '';
    render(root, html`<div class="login-wrap"><div class="card login-card"><h2>No se pudo iniciar</h2>
      <p>${c === 'auth/operation-not-allowed' || c === 'auth/admin-restricted-operation'
        ? 'En Firebase Console → Authentication → Sign-in method debes activar «Anónimo» y «Correo/contraseña».'
        : 'Error de autenticación: ' + c}</p>
      <button class="btn primary" onclick="location.reload()">Reintentar</button></div></div>`);
    return;
  }

  const lazy = (path, fn = 'default') => async (...a) => (await import(path))[fn](...a);

  ruta('/', lazy('./views/home.js'));
  ruta('/mesa/:id', lazy('./views/home.js', 'entrarMesa'));
  ruta('/carrito', lazy('./views/cart.js'));
  ruta('/pedido/:id', lazy('./views/pedido.js'));
  ruta('/login', lazy('./views/login.js'));
  ruta('/t/:codigo', lazy('./views/login.js', 'codigoDirecto'));
  ruta('/setup', lazy('./views/setup.js'));
  ruta('/panel', lazy('./views/panel.js'));
  ruta('/panel/:mod', lazy('./views/panel.js'));

  // Cuando cambia el rol (login, logout, vencimiento de temporal) se vuelve a pintar la vista.
  let rolPrevio = S.rol + '|' + S.user?.uid;
  onChange(t => {
    if (t !== 'auth') return;
    const nuevo = S.rol + '|' + S.user?.uid;
    if (nuevo !== rolPrevio) {
      rolPrevio = nuevo;
      if (location.hash.startsWith('#/panel') && !S.rol) go('/login', true); else despachar();
    }
  });

  iniciarRouter();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
main();
