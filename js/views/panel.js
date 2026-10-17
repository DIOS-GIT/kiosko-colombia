// Panel del personal: menú por rol y carga de módulos.
import { html, render, on, go, toast, confirmar } from '../util.js';
import { S, onChange, logout, nombreRol } from '../session.js';
import { iniciarLive } from '../data.js';
import { usarPedidos, sonidoActivo, alternarSonido } from '../pedidosStore.js';

const TODOS = ['admin', 'gerente', 'mesero', 'cocina', 'cajero', 'domiciliario', 'inventario'];
const STAFF_TURNO = ['admin', 'gerente', 'mesero', 'cocina', 'cajero', 'domiciliario'];

// id, icono, etiqueta, roles, archivo del módulo
const MODULOS = [
  ['inicio', '🏠', 'Inicio', TODOS, 'dash.js'],
  ['pedidos', '🧾', 'Pedidos', ['admin', 'gerente', 'mesero', 'cajero', 'domiciliario'], 'pedidos.js'],
  ['cocina', '👨‍🍳', 'Cocina', ['admin', 'gerente', 'cocina'], 'cocina.js'],
  ['caja', '💵', 'Caja y turno', ['admin', 'gerente', 'cajero'], 'caja.js'],
  ['mesas', '🪑', 'Mesas y QR', ['admin', 'gerente'], 'mesas.js'],
  ['carta', '📖', 'Carta', ['admin', 'gerente', 'cocina'], 'carta.js'],
  ['temporales', '⏱️', 'Temporales', ['admin', 'gerente'], 'temporales.js'],
  ['equipo', '👥', 'Equipo', ['admin'], 'equipo.js'],
  ['inventario', '📦', 'Inventario', ['admin', 'gerente', 'inventario'], 'inventario.js'],
  ['gastos', '💸', 'Gastos', ['admin', 'gerente', 'inventario'], 'gastos.js'],
  ['reportes', '📊', 'Reportes', ['admin', 'gerente'], 'reportes.js'],
  ['auditoria', '🔎', 'Auditoría', ['admin', 'gerente'], 'auditoria.js'],
  ['escaner', '📷', 'Escáner QR', STAFF_TURNO, 'escaner.js'],
  ['config', '⚙️', 'Configuración', ['admin'], 'config.js']
];
const visibles = () => MODULOS.filter(m => m[3].includes(S.rol));

let limpiezaModulo = null;
let liberarPedidos = null, liberarLive = null;

export default async function panel({ mod }, _q, root) {
  if (!S.rol) { go('/login', true); return; }
  const lista = visibles().filter(m => !(S.temporal && m[0] === 'caja'));
  const actual = lista.find(m => m[0] === (mod || 'inicio'));
  if (!actual) { go('/panel/inicio', true); return; }

  // Recursos compartidos mientras el panel esté abierto
  if (!liberarLive) liberarLive = iniciarLive();
  if (!liberarPedidos && S.rol !== 'inventario') liberarPedidos = usarPedidos();

  render(root, html`
    <div class="topbar no-print"><button class="icon-btn" id="menu" aria-label="Menú">☰</button><b>${actual[2]}</b></div>
    <div class="shell">
      <aside class="side no-print" id="side">
        <div class="brand">🌴 ${S.sitio?.nombre || 'Kiosko'}</div>
        ${lista.map(m => html`<a class="nav ${m[0] === actual[0] ? 'on' : ''}" href="#/panel/${m[0]}"><span>${m[1]}</span>${m[2]}</a>`)}
        <a class="nav" href="#/" style="margin-top:8px"><span>🌐</span>Ver sitio público</a>
        <button class="nav btn ghost" id="sonido" style="color:#cfe3e8;justify-content:flex-start;gap:10px;border-radius:12px"><span>${sonidoActivo() ? '🔔' : '🔕'}</span>Sonido ${sonidoActivo() ? 'activado' : 'silenciado'}</button>
        <div class="who">
          <div><b>${S.nombre || 'Sin nombre'}</b></div>
          <div>${nombreRol(S.rol)}${S.temporal ? ' · temporal' : ''}</div>
          <div class="mt">${S.estado.abierto ? '🟢 Caja abierta' : '🔴 Caja cerrada'}</div>
          <button class="btn sm block mt" id="salir">Cerrar sesión</button>
        </div>
      </aside>
      <main class="main" id="mod"></main>
    </div>`);

  const side = root.querySelector('#side');
  on(root, 'click', '#menu', () => {
    side.classList.toggle('open');
    if (side.classList.contains('open')) {
      const sc = document.createElement('div'); sc.className = 'scrim'; sc.onclick = () => { side.classList.remove('open'); sc.remove(); };
      document.body.appendChild(sc);
    }
  });
  on(root, 'click', 'a.nav', () => { side.classList.remove('open'); document.querySelector('.scrim')?.remove(); });
  on(root, 'click', '#sonido', (_e, b) => {
    const s = alternarSonido();
    b.innerHTML = `<span>${s ? '🔔' : '🔕'}</span>Sonido ${s ? 'activado' : 'silenciado'}`;
  });
  on(root, 'click', '#salir', async () => {
    if (S.temporal && !await confirmar('Si sales, tu código ya no se podrá usar de nuevo. ¿Cerrar sesión?', { ok: 'Salir', peligro: true })) return;
    await logout(); go('/', true);
  });

  // Cargar módulo
  const cont = root.querySelector('#mod');
  render(cont, html`<div class="empty"><div class="spinner" style="margin:auto"></div></div>`);
  try {
    const m = await import('./panel/' + actual[4]);
    const limpiar = await m.default(cont);
    limpiezaModulo = typeof limpiar === 'function' ? limpiar : null;
  } catch (e) {
    console.error(e);
    render(cont, html`<div class="banner err">No se pudo cargar este módulo: ${e.message}</div>`);
  }

  const offEstado = onChange(t => { if (t === 'estado') { const w = root.querySelector('.who'); if (w) { const x = w.children[3]; if (x) x.textContent = S.estado.abierto ? '🟢 Caja abierta' : '🔴 Caja cerrada'; } } });

  return () => {
    offEstado();
    if (limpiezaModulo) { try { limpiezaModulo(); } catch (e) { console.error(e); } limpiezaModulo = null; }
    // Los recursos compartidos se liberan solo si salimos del panel
    if (!location.hash.startsWith('#/panel')) {
      if (liberarPedidos) { liberarPedidos(); liberarPedidos = null; }
      if (liberarLive) { liberarLive(); liberarLive = null; }
      document.querySelector('.scrim')?.remove();
    }
  };
}
