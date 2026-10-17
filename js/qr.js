// Generación de códigos QR (librería local en /vendor, sin depender de internet).
import { loadScript } from './util.js';

export async function qrDataUrl(texto, ancho = 512) {
  await loadScript('vendor/qrcode.min.js');
  return window.QRCode.toDataURL(texto, {
    width: ancho, margin: 2, errorCorrectionLevel: 'M',
    color: { dark: '#0f2a33', light: '#ffffff' }
  });
}

// URL base de la web (funciona en GitHub Pages con subcarpeta).
export function baseUrl() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}
export const urlMesa = id => baseUrl() + '#/mesa/' + id;
export const urlCodigo = c => baseUrl() + '#/t/' + c;
export const urlPedido = id => baseUrl() + '#/pedido/' + id;
