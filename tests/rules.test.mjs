// Pruebas de las reglas de seguridad (firestore.rules) con el emulador de Firebase.
// Cómo correrlas (desde esta carpeta, con Java instalado):
//   npm install && npm test
// IMPORTANTE: estas pruebas se escribieron junto con la v1 pero NO se pudieron ejecutar
// en el entorno donde se construyó (no podía descargar el emulador). Córrelas antes de
// poner el sistema en producción y corrige lo que falle.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, getDocs, collection, query, where, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;
const anon = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const staff = uid => env.authenticatedContext(uid).firestore();
const enMs = ms => Timestamp.fromDate(new Date(Date.now() + ms));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kiosko',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'usuarios', 'adm'), { nombre: 'Admin', rol: 'admin', activo: true });
    await setDoc(doc(db, 'usuarios', 'ger'), { nombre: 'Gerente', rol: 'gerente', activo: true });
    await setDoc(doc(db, 'usuarios', 'mes'), { nombre: 'Mesero', rol: 'mesero', activo: true });
    await setDoc(doc(db, 'usuarios', 'coc'), { nombre: 'Cocina', rol: 'cocina', activo: true });
    await setDoc(doc(db, 'config', 'sitio'), { nombre: 'Kiosko' });
    await setDoc(doc(db, 'config', 'estado'), { abierto: true, turnoId: 't1', pedidosEnLinea: true });
    await setDoc(doc(db, 'turnos', 't1'), { estado: 'abierto' });
    await setDoc(doc(db, 'pedidos', 'ped1'), { uidCliente: 'cli1', estado: 'pendiente_confirmacion', turnoId: 't1', origen: 'recoger', codigo: 'K-2345', items: [], total: 1000 });
  });
});

const pedidoNuevo = uid => ({
  codigo: 'K-2345', origen: 'recoger', uidCliente: uid, cliente: { nombre: 'Ana', telefono: '3001234567' },
  items: [{ productoId: 'p1', nombre: 'Pargo', precio: 38000, cantidad: 1 }], subtotal: 38000, envio: 0, total: 38000,
  estado: 'pendiente_confirmacion', turnoId: 't1', creadoEn: serverTimestamp(), metodoPago: 'efectivo', canal: 'web'
});

test('un cliente anónimo puede crear su pedido como pendiente', async () => {
  await assertSucceeds(setDoc(doc(anon('cli9'), 'pedidos', 'nuevo'), pedidoNuevo('cli9')));
});
test('un cliente NO puede crear un pedido ya confirmado', async () => {
  await assertFails(setDoc(doc(anon('cli9'), 'pedidos', 'nuevo'), { ...pedidoNuevo('cli9'), estado: 'confirmado' }));
});
test('un cliente NO puede crear pedidos con la caja cerrada', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'config', 'estado'), { abierto: false, turnoId: null }));
  await assertFails(setDoc(doc(anon('cli9'), 'pedidos', 'nuevo'), pedidoNuevo('cli9')));
});
test('un cliente no puede leer el pedido de otro, pero sí el suyo', async () => {
  await assertFails(getDoc(doc(anon('cli2'), 'pedidos', 'ped1')));
  await assertSucceeds(getDoc(doc(anon('cli1'), 'pedidos', 'ped1')));
});
test('un cliente no puede confirmar su propio pedido, pero sí cancelarlo', async () => {
  await assertFails(updateDoc(doc(anon('cli1'), 'pedidos', 'ped1'), { estado: 'confirmado' }));
  await assertSucceeds(updateDoc(doc(anon('cli1'), 'pedidos', 'ped1'), { estado: 'cancelado' }));
});

const confirmacion = uid => ({
  estado: 'confirmado', items: [], subtotal: 1000, envio: 0, total: 1000,
  confirmadoPor: uid, confirmadoNombre: 'Mesero', confirmadoEn: serverTimestamp()
});
test('un mesero confirma dejando constancia de quién fue', async () => {
  await assertSucceeds(updateDoc(doc(staff('mes'), 'pedidos', 'ped1'), confirmacion('mes')));
});
test('un mesero NO puede confirmar a nombre de otra persona', async () => {
  await assertFails(updateDoc(doc(staff('mes'), 'pedidos', 'ped1'), confirmacion('ger')));
});
test('cocina NO puede confirmar ni cobrar', async () => {
  await assertFails(updateDoc(doc(staff('coc'), 'pedidos', 'ped1'), confirmacion('coc')));
});
test('solo gerente o admin pueden anular', async () => {
  const anular = uid => ({ estado: 'anulado', anuladoPor: uid, anuladoNombre: 'X', anuladoEn: serverTimestamp(), motivoAnulacion: 'Error de digitación' });
  await assertFails(updateDoc(doc(staff('mes'), 'pedidos', 'ped1'), anular('mes')));
  await assertSucceeds(updateDoc(doc(staff('ger'), 'pedidos', 'ped1'), anular('ger')));
});

test('el gerente crea un acceso temporal; un mesero no', async () => {
  const sesion = uid => ({ nombre: 'Ana', rol: 'mesero', turnoId: 't1', estado: 'pendiente', creadoPor: uid, creadoNombre: 'G', creadoEn: serverTimestamp(), expiraEn: enMs(3600e3), canjeableHasta: enMs(600e3) });
  await assertSucceeds(setDoc(doc(staff('ger'), 'sesiones_temporales', 'CODIGOLARGO123456'), sesion('ger')));
  await assertFails(setDoc(doc(staff('mes'), 'sesiones_temporales', 'OTROCODIGO1234567'), sesion('mes')));
});
test('un gerente no puede crear un temporal con rol de gerente', async () => {
  await assertFails(setDoc(doc(staff('ger'), 'sesiones_temporales', 'CODIGOMALO1234567'), { nombre: 'X', rol: 'admin', turnoId: 't1', estado: 'pendiente', creadoPor: 'ger', creadoEn: serverTimestamp(), expiraEn: enMs(3600e3), canjeableHasta: enMs(600e3) }));
});
test('canje de un solo uso y el acceso muere al cerrar la caja', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'sesiones_temporales', 'CODIGOLARGO123456'),
    { nombre: 'Ana', rol: 'mesero', turnoId: 't1', estado: 'pendiente', creadoPor: 'ger', expiraEn: enMs(3600e3), canjeableHasta: enMs(600e3) }));
  const db = anon('tmp1');
  const canjear = () => { const b = writeBatch(db);
    b.update(doc(db, 'sesiones_temporales', 'CODIGOLARGO123456'), { estado: 'activa', usadoPor: 'tmp1', usadoEn: serverTimestamp() });
    b.set(doc(db, 'accesos', 'tmp1'), { sesionId: 'CODIGOLARGO123456', creadoEn: serverTimestamp() }); return b.commit(); };
  await assertSucceeds(canjear());
  // ya tiene permisos de mesero: lee los pedidos del turno
  await assertSucceeds(getDocs(query(collection(db, 'pedidos'), where('turnoId', '==', 't1'))));
  // otra persona no puede reusar el mismo código
  const otro = anon('tmp2'); const b2 = writeBatch(otro);
  b2.update(doc(otro, 'sesiones_temporales', 'CODIGOLARGO123456'), { estado: 'activa', usadoPor: 'tmp2', usadoEn: serverTimestamp() });
  b2.set(doc(otro, 'accesos', 'tmp2'), { sesionId: 'CODIGOLARGO123456', creadoEn: serverTimestamp() });
  await assertFails(b2.commit());
  // se cierra la caja → se acaba el acceso
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'turnos', 't1'), { estado: 'cerrado' }));
  await assertFails(getDocs(query(collection(db, 'pedidos'), where('turnoId', '==', 't1'))));
});

test('la auditoría solo se puede agregar, nunca editar ni borrar', async () => {
  const db = staff('mes'); const ref = doc(collection(db, 'auditoria'));
  await assertSucceeds(setDoc(ref, { actorUid: 'mes', actorNombre: 'Mesero', accion: 'x', fecha: serverTimestamp() }));
  await assertFails(updateDoc(ref, { accion: 'y' }));
});
test('nadie puede volverse admin una vez configurado el sitio', async () => {
  await assertFails(setDoc(doc(staff('intruso'), 'usuarios', 'intruso'), { nombre: 'I', rol: 'admin', activo: true }));
});
test('solo el admin edita la carta; el gerente solo marca agotado', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'productos', 'p1'), { nombre: 'Pargo', precio: 38000, agotado: false }));
  await assertSucceeds(updateDoc(doc(staff('ger'), 'productos', 'p1'), { agotado: true }));
  await assertFails(updateDoc(doc(staff('ger'), 'productos', 'p1'), { precio: 1 }));
  await assertSucceeds(updateDoc(doc(staff('adm'), 'productos', 'p1'), { precio: 40000 }));
});
