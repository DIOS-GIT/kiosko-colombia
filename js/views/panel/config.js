// Configuración del sitio (solo administrador).
import { html, render, toast, numero, imgUrl } from '../../util.js';
import { S, auditar, aplicarTema } from '../../session.js';
import { db, doc, writeBatch } from '../../fb.js';
import { subirImagen } from '../../cloudinary.js';
import { cloudinaryConfigurado } from '../../config.js';

export default function config(el) {
  const s = S.sitio || {};
  let logo = s.logo || '';
  render(el, html`
    <div class="page-h"><h2>Configuración</h2></div>
    ${cloudinaryConfigurado() ? '' : html`<div class="banner">Cloudinary no está configurado: no podrás subir imágenes. Edita <b>js/config.js</b>.</div>`}
    <form id="f" class="card" style="max-width:720px">
      <div class="grid2">
        <label class="field"><span>Nombre del restaurante</span><input type="text" name="nombre" required maxlength="60" value="${s.nombre || ''}"></label>
        <label class="field"><span>Eslogan</span><input type="text" name="eslogan" maxlength="100" value="${s.eslogan || ''}"></label>
        <label class="field"><span>Horario</span><input type="text" name="horario" maxlength="80" value="${s.horario || ''}" placeholder="Lun–Dom 11:00 am – 10:00 pm"></label>
        <label class="field"><span>Teléfono</span><input type="tel" name="telefono" maxlength="20" value="${s.telefono || ''}"></label>
        <label class="field" style="grid-column:1/-1"><span>Dirección</span><input type="text" name="direccion" maxlength="140" value="${s.direccion || ''}"></label>
        <label class="field"><span>Instagram (enlace)</span><input type="text" name="instagram" maxlength="200" value="${s.instagram || ''}" placeholder="https://instagram.com/…"></label>
        <label class="field"><span>Tarifa de domicilio (COP)</span><input type="number" name="tarifa" min="0" step="500" value="${s.tarifaDomicilio ?? 0}"></label>
        <label class="field"><span>Color principal</span><input type="color" name="c1" value="${s.colorPrimario || '#0b8a9a'}"></label>
        <label class="field"><span>Color de acento</span><input type="color" name="c2" value="${s.colorAcento || '#f7b32b'}"></label>
      </div>
      <label class="field"><span>Aviso en la portada (opcional)</span><input type="text" name="aviso" maxlength="160" value="${s.aviso || ''}" placeholder="Ej.: Hoy 2x1 en cócteles"></label>
      <div class="field"><span>Logo</span><div class="row gap"><img id="prev" class="thumb" style="width:72px;height:72px" src="${logo ? imgUrl(logo, 160) : ''}" alt="" ${logo ? '' : 'hidden'}>
        <input type="file" id="file" accept="image/jpeg,image/png,image/webp"><span class="muted small" id="sub" hidden>Subiendo…</span></div></div>
      <p class="err" id="err" hidden></p>
      <button class="btn primary" id="g">Guardar cambios</button>
    </form>`);

  el.querySelector('#file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    el.querySelector('#sub').hidden = false; el.querySelector('#g').disabled = true;
    try { logo = await subirImagen(f, { max: 512, png: true }); const p = el.querySelector('#prev'); p.src = imgUrl(logo, 160); p.hidden = false; }
    catch (ex) { const er = el.querySelector('#err'); er.hidden = false; er.textContent = ex.message; }
    el.querySelector('#sub').hidden = true; el.querySelector('#g').disabled = false;
  });
  el.querySelector('#f').addEventListener('submit', async e => {
    e.preventDefault(); const fd = new FormData(e.target);
    const datos = {
      nombre: fd.get('nombre').trim(), eslogan: fd.get('eslogan').trim(), horario: fd.get('horario').trim(), telefono: fd.get('telefono').trim(),
      direccion: fd.get('direccion').trim(), instagram: fd.get('instagram').trim(), aviso: fd.get('aviso').trim(),
      tarifaDomicilio: numero(fd.get('tarifa')), colorPrimario: fd.get('c1'), colorAcento: fd.get('c2'), logo
    };
    try {
      const b = writeBatch(db); b.set(doc(db, 'config', 'sitio'), datos, { merge: true });
      auditar(b, 'config.guardar', 'config', 'sitio', datos.nombre); await b.commit();
      aplicarTema({ ...S.sitio, ...datos }); toast('Configuración guardada', 'ok');
    } catch { toast('No se pudo guardar', 'error'); }
  });
}
