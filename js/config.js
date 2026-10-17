// ============================================================
//  CONFIGURACIÓN — pega aquí los datos de TU proyecto
//  (Firebase Console → Configuración del proyecto → Tus apps → Web)
// ============================================================
export const firebaseConfig = {
  apiKey: "PEGA_AQUI_TU_API_KEY",
  authDomain: "TU-PROYECTO.firebaseapp.com",
  projectId: "TU-PROYECTO",
  storageBucket: "TU-PROYECTO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
};

// Cloudinary (plan gratis). Crea un "Upload preset" de tipo UNSIGNED.
// Cloudinary → Settings → Upload → Upload presets
export const cloudinary = {
  cloudName: "TU_CLOUD_NAME",
  uploadPreset: "kiosko_unsigned"
};

// App Check (opcional pero recomendado): clave de sitio de reCAPTCHA v3.
// Déjala vacía ("") mientras pruebas.
export const appCheckSiteKey = "";

export const APP = {
  nombreDefault: "Kiosko Colombia",
  version: "1.0.0"
};

export function estaConfigurado() {
  return !firebaseConfig.apiKey.startsWith("PEGA") && !firebaseConfig.projectId.startsWith("TU-");
}
export function cloudinaryConfigurado() {
  return !cloudinary.cloudName.startsWith("TU_");
}
