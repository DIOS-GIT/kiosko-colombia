// Subida de imágenes a Cloudinary (preset sin firma). Reduce el tamaño antes de subir.
import { cloudinary, cloudinaryConfigurado } from './config.js';

async function redimensionar(file, max, png) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = c.getContext('2d');
  if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, png ? 'image/png' : 'image/jpeg', 0.85));
}

export async function subirImagen(file, { max = 1200, png = false } = {}) {
  if (!cloudinaryConfigurado()) throw new Error('Falta configurar Cloudinary en js/config.js');
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Usa una imagen JPG, PNG o WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('La imagen pesa más de 15 MB.');
  const blob = await redimensionar(file, max, png);
  const fd = new FormData();
  fd.append('file', blob, png ? 'imagen.png' : 'imagen.jpg');
  fd.append('upload_preset', cloudinary.uploadPreset);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`, { method: 'POST', body: fd });
  if (!r.ok) {
    let m = 'No se pudo subir la imagen.';
    try { const j = await r.json(); m = j.error?.message || m; } catch { /* ignora */ }
    throw new Error(m);
  }
  const j = await r.json();
  return j.secure_url;
}
