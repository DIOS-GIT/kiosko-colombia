// Inicio del panel: resumen del turno y primeros pasos.
import { html, render, money, on, go } from '../../util.js';
import { S, nombreRol, onChange } from '../../session.js';
import { suscribirPedidos } from '../../pedidosStore.js';
import { cache, onCache } from '../../data.js';

export function resumenTurno(lista) {
  const cobrados = lista.filter(p => p.estado === 'cobrado');
  const v = cobrados.reduce((a, p) => a + (p.total || 0), 0);
  const por = m => cobrados.filter(p => p.metodoPago === m).reduce((a, p) => a + (p.total || 0), 0);
  return {
    ventas: v, n: cobrados.length, ticket: cobrados.length ? v / cobrados.length : 0,
    efectivo: por('efectivo'), electronico: por('electronico'), contraentrega: por('contraentrega'),
    porConfirmar: lista.filter(p => p.estado === 'pendiente_confirmacion').length,
    enCurso: lista.filter(p => ['confirmado', 'preparando', 'listo', 'entregado'].includes(p.estado)).length,
    anulados: lista.filter(p => ['anulado', 'rechazado', 'cancelado'].includes(p.estado)).length
  };
}

export default function dash(el) {
  let lista = [];
  function pintar() {
    const r = resumenTurno(lista);
    const ver = ['admin', 'gerente', 'cajero'].includes(S.rol);
    const pasos = S.rol === 'admin' ? [
      [cache.categorias.length > 0, 'Crea categorías en «Carta»', '#/panel/carta'],
      [cache.productos.length > 0, 'Agrega productos a la carta', '#/panel/carta'],
      [cache.mesas.length > 0, 'Crea mesas y genera sus QR', '#/panel/mesas'],
      [!!S.sitio?.logo, 'Sube tu logo y datos en «Configuración»', '#/panel/config'],
      [S.estado.abierto, 'Abre la caja para recibir pedidos', '#/panel/caja']
    ] : [];
    render(el, html`
      <div class="page-h"><div><h2>Hola, ${S.nombre || 'equipo'}</h2><div class="muted">${nombreRol(S.rol)}${S.temporal ? ' (acceso temporal)' : ''}</div></div>
        <span class="badge ${S.estado.abierto ? 'ok' : 'err'}">${S.estado.abierto ? 'Caja abierta' : 'Caja cerrada'}</span></div>
      ${!S.estado.abierto ? html`<div class="banner">La caja está cerrada. ${['admin', 'gerente', 'cajero'].includes(S.rol) && !S.temporal ? html`<a href="#/panel/caja">Abrir turno →</a>` : 'Pide a un gerente o cajero que abra el turno.'}</div>` : ''}
      ${pasos.some(p => !p[0]) ? html`<div class="card mb"><h3>Primeros pasos</h3>
        ${pasos.map(p => html`<div class="line"><span>${p[0] ? '✅' : '⬜'} ${p[1]}</span>${p[0] ? '' : html`<a href="${p[2]}">Ir →</a>`}</div>`)}</div>` : ''}
      ${S.estado.abierto ? html`<div class="stats">
        <div class="stat"><div class="n">${r.porConfirmar}</div><div class="l">Por confirmar</div></div>
        <div class="stat"><div class="n">${r.enCurso}</div><div class="l">En curso</div></div>
        ${ver ? html`<div class="stat"><div class="n">${money(r.ventas)}</div><div class="l">Ventas cobradas (${r.n})</div></div>
        <div class="stat"><div class="n">${money(r.ticket)}</div><div class="l">Ticket promedio</div></div>
        <div class="stat"><div class="n">${money(r.efectivo)}</div><div class="l">Efectivo</div></div>
        <div class="stat"><div class="n">${money(r.electronico + r.contraentrega)}</div><div class="l">Electrónico y contraentrega</div></div>` : ''}
      </div>` : ''}`);
  }
  const off1 = suscribirPedidos(l => { lista = l; pintar(); });
  const off2 = onChange(t => { if (t === 'estado') pintar(); });
  const off3 = onCache(pintar);
  return () => { off1(); off2(); off3(); };
}
