import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, useDeviceLanguage } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
import { getFunctions } from "firebase/functions";

// Configuración de Firebase leída desde las variables de entorno de Vite
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Inicialización de Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Ensure redirect results persist across reloads and use device language for provider UI
try {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  try { useDeviceLanguage(auth); } catch {}
} catch {}
// Use long-polling only on constrained/mobile browsers to improve reliability.
// On desktop, default transport is faster.
let db;
try {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  db = initializeFirestore(app, isMobile ? {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  } : {} as any);
} catch {
  db = initializeFirestore(app, {} as any);
}
const storage = getStorage(app);
const functions = getFunctions(app);
let analytics: ReturnType<typeof getAnalytics> | null = null;
try {
  if (typeof window !== 'undefined' && (app.options as any)?.measurementId) {
    analytics = getAnalytics(app);
  }
} catch (e) {
  console.warn('[Firebase] Analytics deshabilitado:', e);
}

export { auth, db, storage, functions, analytics };







