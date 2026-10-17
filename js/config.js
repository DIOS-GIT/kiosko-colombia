// ============================================================
//  CONFIGURACIÓN — pega aquí los datos de TU proyecto
//  (Firebase Console → Configuración del proyecto → Tus apps → Web)
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyD1YGg4UvCC3jmISP4GQ4Eg_LktT5deymY",
  authDomain: "kiosko-colombia.firebaseapp.com",
  projectId: "kiosko-colombia",
  storageBucket: "kiosko-colombia.firebasestorage.app",
  messagingSenderId: "697489490073",
  appId: "1:697489490073:web:e816144ac8e7f2b2123808"
};

// Cloudinary (plan gratis). Crea un "Upload preset" de tipo UNSIGNED.
// Cloudinary → Settings → Upload → Upload presets
export const cloudinary = {
  cloudName: "dy66brku6",
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
