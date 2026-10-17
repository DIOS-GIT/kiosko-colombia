// Utilidades: plantillas HTML seguras, formatos, toasts, modales, etc.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Safe(String(s ?? ''));

function val(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  if (v === false || v == null) return '';
  return esc(v);
}
// html`...` escapa TODO lo interpolado salvo otros html`...` o raw().
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += val(vals[i]); });
  return new Safe(out);
}
export function render(el, content) {
  el.innerHTML = content instanceof Safe ? content.s : esc(content);
}

// ---------- Formatos ----------
const fmtMoney = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const money = n => fmtMoney.format(Number(n) || 0);
export const numero = v => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };

export function tsToDate(t) {
  if (!t) return null;
  if (typeof t.toDate === 'function') return t.toDate();
  if (t instanceof Date) return t;
  const d = new Date(t);
  return isNaN(d) ? null : d;
}
export function fmtTime(t) {
  const d = tsToDate(t); if (!d) return '—';
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}
export function fmtDateTime(t) {
  const d = tsToDate(t); if (!d) return '—';
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function tiempoDesde(t) {
  const d = tsToDate(t); if (!d) return '';
  const m = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h} h ${m % 60} min`;
}

// Solo permite URLs http(s) en src/href que vienen de la base de datos.
export function safeUrl(u) {
  try { const x = new URL(u, location.href); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; }
  catch { return ''; }
}
// Optimiza imágenes de Cloudinary (formato y calidad automáticos, ancho máximo).
export function imgUrl(u, w = 600) {
  const s = safeUrl(u);
  if (!s) return '';
  return s.includes('res.cloudinary.com') && s.includes('/upload/')
    ? s.replace('/upload/', `/upload/f_auto,q_auto,w_${w},c_limit/`) : s;
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I
export function randomId(len = 16, alfabeto = ALFABETO) {
  const a = new Uint8Array(len); crypto.getRandomValues(a);
  return Array.from(a, x => alfabeto[x % alfabeto.length]).join('');
}
export const codigoPedido = () => 'K-' + randomId(4, '23456789');

export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const scripts = {};
export function loadScript(url) {
  if (scripts[url]) return scripts[url];
  scripts[url] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + url));
    document.head.appendChild(s);
  });
  return scripts[url];
}

// ---------- Navegación ----------
export const go = (path, replace = false) => {
  const h = '#' + path;
  if (replace) location.replace(h); else location.hash = h;
};
export function parseQuery(s) {
  const o = {}; new URLSearchParams(s || '').forEach((v, k) => o[k] = v); return o;
}

// ---------- Toasts ----------
export function toast(msg, tipo = 'info', ms = 3500) {
  const box = document.getElementById('toasts'); if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast ' + tipo; t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- Modales ----------
export function openModal({ title = '', content, wide = false, onMount, onClose, dismissable = true }) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h3></h3><button class="icon-btn" data-x aria-label="Cerrar">✕</button></div>
    <div class="modal-b"></div></div>`;
  wrap.querySelector('h3').textContent = title;
  const body = wrap.querySelector('.modal-b');
  render(body, content);
  let cerrado = false;
  const close = () => {
    if (cerrado) return; cerrado = true; wrap.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = e => { if (e.key === 'Escape' && dismissable) close(); };
  wrap.querySelector('[data-x]').onclick = close;
  if (dismissable) wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  root.appendChild(wrap);
  if (onMount) onMount(body, close);
  const f = body.querySelector('input,select,textarea'); if (f) f.focus();
  return { el: body, close };
}

export function confirmar(texto, { titulo = 'Confirmar', ok = 'Aceptar', cancelar = 'Cancelar', peligro = false } = {}) {
  return new Promise(res => {
    let hecho = false; const fin = v => { if (!hecho) { hecho = true; res(v); } };
    openModal({
      title: titulo,
      content: html`<p class="pre">${texto}</p>
        <div class="row end gap mt"><button class="btn ghost" data-no>${cancelar}</button>
        <button class="btn ${peligro ? 'danger' : 'primary'}" data-si>${ok}</button></div>`,
      onMount: (el, close) => {
        el.querySelector('[data-si]').onclick = () => { fin(true); close(); };
        el.querySelector('[data-no]').onclick = () => { fin(false); close(); };
      },
      onClose: () => fin(false)
    });
  });
}

export function pedirTexto(titulo, etiqueta, { min = 3, max = 200, ok = 'Aceptar', multilinea = false, placeholder = '' } = {}) {
  return new Promise(res => {
    let hecho = false; const fin = v => { if (!hecho) { hecho = true; res(v); } };
    openModal({
      title: titulo,
      content: html`<label class="field"><span>${etiqueta}</span>
        ${multilinea ? html`<textarea rows="3" maxlength="${max}" placeholder="${placeholder}"></textarea>`
          : html`<input type="text" maxlength="${max}" placeholder="${placeholder}">`}</label>
        <p class="err" hidden></p>
        <div class="row end gap mt"><button class="btn ghost" data-no>Cancelar</button>
        <button class="btn primary" data-si>${ok}</button></div>`,
      onMount: (el, close) => {
        const inp = el.querySelector('input,textarea'), err = el.querySelector('.err');
        el.querySelector('[data-si]').onclick = () => {
          const v = inp.value.trim();
          if (v.length < min) { err.hidden = false; err.textContent = `Escribe al menos ${min} caracteres.`; return; }
          fin(v); close();
        };
        el.querySelector('[data-no]').onclick = () => { fin(null); close(); };
      },
      onClose: () => fin(null)
    });
  });
}

// ---------- Sonido de aviso ----------
let audioCtx;
export function beep(freq = 880, ms = 180, veces = 2) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < veces; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.value = 0.15; o.connect(g); g.connect(audioCtx.destination);
      const t0 = audioCtx.currentTime + i * (ms / 1000 + 0.08);
      o.start(t0); o.stop(t0 + ms / 1000);
    }
  } catch { /* sin audio */ }
}

// Delegación de eventos: on(el,'click','[data-a]',(e,target)=>{})
export function on(el, tipo, selector, fn) {
  el.addEventListener(tipo, e => {
    const t = e.target.closest(selector);
    if (t && el.contains(t)) fn(e, t);
  });
}
