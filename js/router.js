// Router por hash (#/ruta). Funciona en GitHub Pages sin configuración extra.
import { parseQuery, go } from './util.js';

const rutas = [];
let limpiar = null, ficha = 0;

export function ruta(patron, handler) {
  const keys = [];
  const re = new RegExp('^' + patron.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  rutas.push({ re, keys, handler });
}

export async function despachar() {
  const crudo = location.hash.slice(1) || '/';
  const [path, qs] = crudo.split('?');
  const q = parseQuery(qs);
  const mia = ++ficha;
  if (limpiar) { try { limpiar(); } catch (e) { console.error(e); } limpiar = null; }
  for (const r of rutas) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = {}; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]));
    // Contenedor nuevo en cada vista: así no se acumulan escuchas de eventos de vistas anteriores.
    const viejo = document.getElementById('app');
    const root = viejo.cloneNode(false);
    viejo.replaceWith(root);
    window.scrollTo(0, 0);
    try {
      const res = await r.handler(params, q, root);
      if (typeof res === 'function') {
        if (mia === ficha) limpiar = res; else res(); // la vista ya no está activa
      }
    } catch (e) {
      console.error(e);
      root.innerHTML = '<div class="pad"><p>Ocurrió un error al cargar esta página.</p><p><a href="#/">Volver al inicio</a></p></div>';
    }
    return;
  }
  go('/', true);
}

export function iniciarRouter() {
  window.addEventListener('hashchange', despachar);
  despachar();
}
