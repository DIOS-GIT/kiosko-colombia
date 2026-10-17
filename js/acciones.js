// Cambios de estado de los pedidos. Cada uno deja constancia de QUIÉN lo hizo y CUÁNDO,
// y escribe una línea en la auditoría en la misma operación (todo o nada).
import { db, doc, writeBatch, serverTimestamp, setDoc } from './fb.js';
import { S, auditar } from './session.js';
import { calcularItems } from './data.js';
import { toast, pedirTexto, confirmar, codigoPedido, randomId } from './util.js';

const quien = (p) => ({ [p + 'Por']: S.user.uid, [p + 'Nombre']: S.nombre || '—', [p + 'En']: serverTimestamp() });

async function aplicar(pedido, campos, accion, detalle = '') {
  const b = writeBatch(db);
  b.update(doc(db, 'pedidos', pedido.id), campos);
  auditar(b, accion, 'pedido', pedido.id, `${pedido.codigo} ${detalle}`.trim());
  try { await b.commit(); return true; }
  catch (e) {
    console.error(e);
    toast(e.code === 'permission-denied'
      ? 'No se pudo: el pedido cambió de estado, la caja se cerró o no tienes permiso.' : 'No se pudo guardar. Revisa tu conexión.', 'error', 5000);
    return false;
  }
}

export async function confirmarPedido(p) {
  const calc = calcularItems(p.items, p.origen);
  if (calc.avisos.length) {
    const ok = await confirmar('Atención:\n• ' + calc.avisos.join('\n• ') + '\n\n¿Confirmar de todos modos?', { titulo: 'Revisar pedido', ok: 'Confirmar' });
    if (!ok) return false;
  }
  const cambio = Math.abs(calc.total - (p.total || 0)) > 0.5;
  const r = await aplicar(p, {
    estado: 'confirmado', items: calc.items, subtotal: calc.subtotal, envio: calc.envio, total: calc.total,
    ...quien('confirmado')
  }, 'pedido.confirmar', cambio ? `(total ajustado a precios vigentes)` : '');
  if (r) toast(`Pedido ${p.codigo} confirmado y enviado a cocina`, 'ok');
  return r;
}
export async function rechazarPedido(p) {
  const motivo = await pedirTexto('Rechazar pedido', 'Motivo (el cliente lo verá)', { min: 3, max: 140, ok: 'Rechazar' });
  if (!motivo) return false;
  return aplicar(p, { estado: 'rechazado', motivoRechazo: motivo, ...quien('rechazado') }, 'pedido.rechazar', motivo);
}
export const prepararPedido = p => aplicar(p, { estado: 'preparando', preparadoPor: S.user.uid, preparadoNombre: S.nombre || '—', preparandoEn: serverTimestamp() }, 'pedido.preparar');
export const pedidoListo = p => aplicar(p, { estado: 'listo', ...quien('listo') }, 'pedido.listo');
export const entregarPedido = p => aplicar(p, { estado: 'entregado', ...quien('entregado') }, 'pedido.entregar');

export async function cobrarPedido(p) {
  const { openModal, html, money } = await import('./util.js');
  return new Promise(res => {
    let hecho = false; const fin = v => { if (!hecho) { hecho = true; res(v); } };
    openModal({
      title: `Cobrar ${p.codigo}`,
      content: html`<p class="total">${money(p.total)}</p>
        <label class="field"><span>Método de pago</span><select id="m">
          <option value="efectivo" ${p.metodoPago === 'efectivo' ? 'selected' : ''}>Efectivo</option>
          <option value="electronico" ${p.metodoPago === 'electronico' ? 'selected' : ''}>Electrónico</option>
          <option value="contraentrega" ${p.metodoPago === 'contraentrega' ? 'selected' : ''}>Contraentrega</option></select></label>
        <div class="row end gap mt"><button class="btn ghost" data-no>Cancelar</button><button class="btn ok" data-si>Registrar cobro</button></div>`,
      onMount: (el, close) => {
        el.querySelector('[data-no]').onclick = () => { fin(false); close(); };
        el.querySelector('[data-si]').onclick = async e => {
          e.target.disabled = true;
          const m = el.querySelector('#m').value;
          const ok = await aplicar(p, { estado: 'cobrado', metodoPago: m, ...quien('cobrado') }, 'pedido.cobrar', `${m} $${p.total}`);
          if (ok) toast(`Cobrado ${p.codigo}`, 'ok');
          fin(ok); if (ok) close(); else e.target.disabled = false;
        };
      },
      onClose: () => fin(false)
    });
  });
}

export async function anularPedido(p) {
  const motivo = await pedirTexto('Anular pedido', 'Motivo de la anulación (queda en auditoría)', { min: 3, max: 140, ok: 'Anular' });
  if (!motivo) return false;
  return aplicar(p, { estado: 'anulado', motivoAnulacion: motivo, ...quien('anulado') }, 'pedido.anular', motivo);
}

// Pedido tomado por un empleado (mesero/cajero/gerente): se crea y se confirma en el acto.
export async function crearPedidoStaff({ origen, mesa, cliente, items, nota }) {
  const calc = calcularItems(items, origen);
  const id = randomId(20, 'abcdefghijkmnpqrstuvwxyz23456789');
  const codigo = codigoPedido();
  const pedido = {
    codigo, origen,
    ...(origen === 'mesa' ? { mesaId: mesa.id, mesaNumero: mesa.numero } : {}),
    uidCliente: S.user.uid, cliente,
    items: calc.items, subtotal: calc.subtotal, envio: calc.envio, total: calc.total,
    estado: 'pendiente_confirmacion', turnoId: S.estado.turnoId, creadoEn: serverTimestamp(),
    metodoPago: 'efectivo', nota: nota || '', canal: 'personal'
  };
  await setDoc(doc(db, 'pedidos', id), pedido);
  const b = writeBatch(db);
  b.update(doc(db, 'pedidos', id), {
    estado: 'confirmado', items: calc.items, subtotal: calc.subtotal, envio: calc.envio, total: calc.total, ...quien('confirmado')
  });
  auditar(b, 'pedido.crear_staff', 'pedido', id, `${codigo} ${origen}`);
  await b.commit();
  return codigo;
}
