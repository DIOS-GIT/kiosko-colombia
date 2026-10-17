// Punto único de importación de Firebase (SDK modular por CDN, sin compilar).
import { initializeApp, getApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import * as A from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import * as F from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig, appCheckSiteKey } from './config.js';

export const app = initializeApp(firebaseConfig);

if (appCheckSiteKey) {
  try {
    const AC = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js');
    AC.initializeAppCheck(app, {
      provider: new AC.ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
  } catch (e) { console.warn('App Check no se pudo iniciar', e); }
}

export const auth = A.getAuth(app);
export const db = F.initializeFirestore(app, { ignoreUndefinedProperties: true });

export const {
  onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail
} = A;

export const {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where,
  orderBy, limit, onSnapshot, serverTimestamp, writeBatch, Timestamp, runTransaction, increment
} = F;

// Segunda instancia de Auth: permite al admin crear cuentas de empleados
// sin cerrar su propia sesión.
export function authSecundario() {
  let sec;
  try { sec = getApp('sec'); } catch { sec = initializeApp(firebaseConfig, 'sec'); }
  return A.getAuth(sec);
}
