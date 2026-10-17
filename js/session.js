// Sesión, rol del usuario y estado global (caja abierta, datos del sitio).
import {
  auth, db, doc, getDoc, onSnapshot, signInAnonymously, onAuthStateChanged, signOut,
  signInWithEmailAndPassword, writeBatch, serverTimestamp, collection
} from './fb.js';
import { tsToDate, toast } from './util.js';
import { APP } from './config.js';

export const ROLES = {
  admin: 'Administrador',
  gerente: 'Gerente de turno',
  mesero: 'Mesero',
  cocina: 'Cocina',
  cajero: 'Cajero',
  domiciliario: 'Domiciliario',
  inventario: 'Inventario'
};
export const ROLES_TEMP = ['mesero', 'cocina', 'cajero', 'domiciliario'];
export const nombreRol = r => ROLES[r] || r || '';

export const S = {
  ready: false,
  user: null,
  rol: '',
  nombre: '',
  temporal: false,
  sesion: null,
  estado: { abierto: false, turnoId: null, pedidosEnLinea: true },
  sitio: null,
  configurado: null, // null = aún no se sabe
  authError: null
};

const subs = new Set();
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit(tipo) { subs.forEach(f => { try { f(tipo, S); } catch (e) { console.error(e); } }); }

export const rolEn = (...lista) => lista.includes(S.rol);

// ---------- Tema ----------
export function aplicarTema(sitio) {
  const r = document.documentElement.style;
  if (sitio?.colorPrimario) r.setProperty('--c-primary', sitio.colorPrimario);
  if (sitio?.colorAcento) r.setProperty('--c-accent', sitio.colorAcento);
  document.title = sitio?.nombre || APP.nombreDefault;
  const m = document.querySelector('meta[name=theme-color]');
  if (m && sitio?.colorPrimario) m.setAttribute('content', sitio.colorPrimario);
}

// ---------- Resolver rol ----------
async function resolverRol(user) {
  S.rol = ''; S.nombre = ''; S.temporal = false; S.sesion = null; S.perfil = null;
  if (!user) return;
  if (!user.isAnonymous) {
    try {
      const snap = await getDoc(doc(db, 'usuarios', user.uid));
      if (snap.exists() && snap.data().activo === true) {
        S.perfil = snap.data(); S.rol = S.perfil.rol; S.nombre = S.perfil.nombre;
      }
    } catch (e) { console.warn('No se pudo leer el perfil', e); }
    return;
  }
  // Anónimo: ¿tiene un acceso temporal vigente?
  try {
    const a = await getDoc(doc(db, 'accesos', user.uid));
    if (!a.exists()) return;
    const sid = a.data().sesionId;
    const s = await getDoc(doc(db, 'sesiones_temporales', sid));
    if (!s.exists()) return;
    const d = s.data();
    const exp = tsToDate(d.expiraEn);
    if (d.estado === 'activa' && d.usadoPor === user.uid && exp && exp > new Date()) {
      const t = await getDoc(doc(db, 'turnos', d.turnoId)); // si ya no es válido, las reglas lo niegan
      if (t.exists() && t.data().estado === 'abierto') {
        S.rol = d.rol; S.nombre = d.nombre; S.temporal = true; S.sesion = { id: sid, ...d };
      }
    }
  } catch { /* permiso denegado → acceso no válido */ }
}

// ---------- Vigilancia del acceso temporal ----------
let unsubSesion = null, timer = null;
function vigilarTemporal() {
  if (unsubSesion) { unsubSesion(); unsubSesion = null; }
  clearInterval(timer);
  if (S.temporal && S.sesion) {
    unsubSesion = onSnapshot(doc(db, 'sesiones_temporales', S.sesion.id),
      snap => { const d = snap.data(); if (!d || d.estado !== 'activa') finTemporal('Tu acceso fue revocado.'); },
      () => finTemporal('Tu acceso terminó.'));
    timer = setInterval(revisarTemporal, 20000);
  }
}
function revisarTemporal() {
  if (!S.temporal || !S.sesion) return;
  const exp = tsToDate(S.sesion.expiraEn);
  if ((exp && exp < new Date()) || !S.estado.abierto || S.estado.turnoId !== S.sesion.turnoId) {
    finTemporal('La caja se cerró: tu acceso temporal terminó.');
  }
}
function finTemporal(msg) {
  if (!S.temporal) return;
  S.rol = ''; S.temporal = false; S.sesion = null; S.nombre = '';
  vigilarTemporal();
  toast(msg, 'info', 6000);
  emit('auth');
}

// ---------- Estado global público ----------
let globalesIniciados = false;
function vigilarGlobales() {
  if (globalesIniciados) return; globalesIniciados = true;
  onSnapshot(doc(db, 'config', 'estado'), snap => {
    S.estado = { abierto: false, turnoId: null, pedidosEnLinea: true, ...(snap.exists() ? snap.data() : {}) };
    emit('estado'); revisarTemporal();
  }, e => console.warn('config/estado', e));
  onSnapshot(doc(db, 'config', 'sitio'), snap => {
    S.configurado = snap.exists(); S.sitio = snap.exists() ? snap.data() : null;
    aplicarTema(S.sitio); emit('sitio');
  }, e => { console.warn('config/sitio', e); S.configurado = false; emit('sitio'); });
}

// ---------- Inicio ----------
export function iniciarSesion() {
  return new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      if (!user) {
        try { await signInAnonymously(auth); }
        catch (e) { S.authError = e; S.user = null; S.ready = true; emit('auth'); resolve(); }
        return;
      }
      S.user = user; S.authError = null;
      vigilarGlobales();
      await resolverRol(user);
      vigilarTemporal();
      S.ready = true; emit('auth'); resolve();
    });
  });
}

export async function loginStaff(email, pass) {
  await signInWithEmailAndPassword(auth, email, pass);
}
export async function logout() { await signOut(auth); }

// Canjea un código de empleado temporal (un solo uso).
export async function canjearCodigo(crudo) {
  const id = String(crudo || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (id.length < 12) throw new Error('El código no es válido.');
  const user = auth.currentUser;
  if (!user) throw new Error('Sin conexión con el servidor. Intenta de nuevo.');
  if (!user.isAnonymous) throw new Error('Cierra tu sesión de personal antes de usar un código temporal.');
  const ref = doc(db, 'sesiones_temporales', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Código no válido.');
  const d = snap.data(), ahora = new Date();
  if (d.estado !== 'pendiente') throw new Error('Este código ya fue usado o fue revocado.');
  if (tsToDate(d.canjeableHasta) < ahora || tsToDate(d.expiraEn) < ahora) throw new Error('Este código venció. Pide uno nuevo.');
  const batch = writeBatch(db);
  batch.update(ref, { estado: 'activa', usadoPor: user.uid, usadoEn: serverTimestamp() });
  batch.set(doc(db, 'accesos', user.uid), { sesionId: id, creadoEn: serverTimestamp() });
  try { await batch.commit(); }
  catch (e) { throw new Error('No se pudo activar el código (¿la caja sigue abierta?).'); }
  await resolverRol(user); vigilarTemporal(); emit('auth');
  if (!S.rol) throw new Error('El código no quedó activo. Pide uno nuevo.');
}

// ---------- Auditoría ----------
export function auditar(batch, accion, entidad, entidadId, detalle = '') {
  const ref = doc(collection(db, 'auditoria'));
  batch.set(ref, {
    actorUid: S.user.uid,
    actorNombre: S.nombre || '—',
    rol: S.rol + (S.temporal ? ' (temporal)' : ''),
    accion, entidad,
    entidadId: String(entidadId || ''),
    detalle: String(detalle).slice(0, 300),
    fecha: serverTimestamp()
  });
}
