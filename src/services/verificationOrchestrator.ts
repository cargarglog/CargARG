// Integración de verificación extendida — Orquestador de intentos
// CargARG Identity Extended Integration
import * as firestore from 'firebase/firestore';
import { db, storage, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
// CargARG Identity Extended Integration
import { processWithDocumentAI } from './documentAiService';
import { assessImageQuality } from './visionService';

export type ProviderName = 'IA' | 'DocumentAI' | 'HumiOberif' | 'Staff';

export interface AttemptContext {
  ref: firestore.DocumentReference;
  attemptNumber: number;
}

// Crea o reanuda un intento si hay uno "in_progress". No borra datos previos.
export async function startOrResumeAttempt(uid: string): Promise<AttemptContext> {
  const col = firestore.collection(db, 'identity_verification_logs', uid, 'attempts');
  const q = firestore.query(col, firestore.orderBy('createdAt', 'desc'), firestore.limit(1));
  const snap = await firestore.getDocs(q);
  let lastNumber = 0;
  if (!snap.empty) {
    const d = snap.docs[0];
    const data: any = d.data();
    lastNumber = data?.attemptNumber || 0;
    if (data?.status === 'in_progress') {
      return { ref: d.ref, attemptNumber: data.attemptNumber };
    }
  }
  const nextNumber = lastNumber + 1;
  const ref = firestore.doc(col);
  const provider: ProviderName = nextNumber === 1 ? 'IA' : nextNumber === 2 ? 'DocumentAI' : nextNumber === 3 ? 'HumiOberif' : 'Staff';
  await firestore.setDoc(ref, {
    attemptId: ref.id,
    attemptNumber: nextNumber,
    provider,
    status: 'in_progress',
    components: {},
    createdAt: firestore.serverTimestamp(),
    updatedAt: firestore.serverTimestamp(),
  }, { merge: true });
  return { ref, attemptNumber: nextNumber };
}

export async function finalizeAttemptAndRoute(params: {
  uid: string;
  attemptRef: firestore.DocumentReference;
  attemptNumber: number;
  selfieUri: string;
  dniFrontUri: string;
  dniBackUri?: string;
  licenseFrontUri?: string;
  licenseBackUri?: string;
  dniNumber?: string;
}): Promise<void> {
  const { uid, attemptRef, attemptNumber, selfieUri, dniFrontUri, dniBackUri, licenseFrontUri, licenseBackUri, dniNumber } = params;
  const provider: ProviderName = attemptNumber === 1 ? 'IA' : attemptNumber === 2 ? 'DocumentAI' : attemptNumber === 3 ? 'HumiOberif' : 'Staff';

  // Chequeo de unicidad (solo registra bandera; staff decide)
  let duplicateOfUid: string | null = null;
  if (dniNumber) {
    try {
      const regDoc = await firestore.getDoc(firestore.doc(db, 'dniRegistry', dniNumber));
      if (regDoc.exists()) {
        const data: any = regDoc.data();
        if (data?.uid && data.uid !== uid) duplicateOfUid = data.uid;
      }
    } catch {}
  }

  let confidenceScore = 0.6;
  let extractedData: any = undefined;

  try {
    if (provider === 'IA') {
      // Calidad + consistencia (se mantiene Gemini como hoy)
      const { checkDocumentConsistency } = await import('./geminiService');
      const resp = await checkDocumentConsistency(
        await fetchAsBase64(dniFrontUri),
        dniBackUri ? await fetchAsBase64(dniBackUri) : '',
        await fetchAsBase64(selfieUri),
        dniNumber || ''
      );
      confidenceScore = resp.success ? 0.8 : 0.5;
      extractedData = { reason: resp.reason };
    } else if (provider === 'DocumentAI') {
      // Llamar Cloud Function (callable) para Vision+Document AI
      const analyze = httpsCallable(functions as any, 'analyzeWithVisionAndDocAI');
      const gcsUris = toGcsUris({ dniFrontUri, dniBackUri, licenseFrontUri, licenseBackUri });
      const result: any = await analyze({
        uid,
        attemptId: attemptRef.id,
        attemptPath: attemptRef.path,
        dniNumber: dniNumber || null,
        gcsUris: { front: gcsUris.dniFrontUri, back: gcsUris.dniBackUri },
        countryISO2: 'AR',
      });
      let cs = result?.data?.confidenceScore; if (typeof cs === 'number' && cs > 1.5) cs = cs / 100; confidenceScore = (typeof cs === 'number') ? cs : 0.8;
      extractedData = result?.data?.extractedData;
    } else if (provider === 'HumiOberif') {
      // Iniciar verificación premium desde Function callable
      const startPremium = httpsCallable(functions as any, 'startPremiumVerification');
      await startPremium({
        uid,
        attemptId: attemptRef.id,
        countryISO2: 'AR',
        assets: { frontUri: dniFrontUri, backUri: dniBackUri, selfieUri, videoUri: null },
      });
    }
  } catch {}

  await firestore.setDoc(attemptRef, {
    provider,
    confidenceScore,
    duplicateOfUid: duplicateOfUid || null,
    attemptStatus: 'pending',
    status: 'pending',
    updatedAt: firestore.serverTimestamp(),
    components: firestore.fieldValue?.arrayUnion ? undefined : undefined,
  }, { merge: true });
}

async function fetchAsBase64(uri: string): Promise<string> {
  // Solo para paso a Gemini en cliente. En producción conviene proxy backend.
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = (reader.result as string) || '';
      resolve(s.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function toGcsUris(uris: { [k: string]: string | undefined }) {
  const bucket = (storage as any).app?.options?.storageBucket as string | undefined;
  const out: Record<string, string | undefined> = {};
  Object.entries(uris).forEach(([k, v]) => {
    if (!v) { out[k] = undefined; return; }
    if (v.startsWith('gs://')) { out[k] = v; return; }
    try {
      const u = new URL(v);
      // https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?...
      const pathEnc = u.pathname.split('/o/')[1] || '';
      const path = decodeURIComponent(pathEnc);
      if (bucket && path) out[k] = `gs://${bucket}/${path}`;
      else out[k] = v;
    } catch { out[k] = v; }
  });
  return out;
}

