// CargARG Identity Extended Integration — Firebase Cloud Functions
// CargARG Identity Extended Integration
import * as functions from 'firebase-functions/v1';

import * as admin from 'firebase-admin';
import corsLib from 'cors';
import crypto from 'crypto';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

const cors = corsLib({ origin: true });
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Callable: analyzeWithVisionAndDocAI
export const analyzeWithVisionAndDocAI = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = String(data.uid || context.auth.uid);
  const attemptPath = String(data.attemptPath || '');
  const gcsUris = data.gcsUris || {};
  const dniNumber = data.dniNumber || null;
  const ref = db.doc(attemptPath);

  const visionClient = new ImageAnnotatorClient();
  const docClient = new DocumentProcessorServiceClient();
  const processorName = `projects/${process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT}/locations/${process.env.DOC_AI_LOCATION}/processors/${process.env.DOC_AI_PROCESSOR_ID}`;

  let confidenceScore = 0.65;
  let extractedData: any = {};
  let machineReadable = { qr: false, pdf417: false, mrz: false };

  const downloadBuffer = async (uri?: string): Promise<Buffer | null> => {
    if (!uri) return null;
    if (uri.startsWith('gs://')) {
      const noScheme = uri.replace('gs://', '');
      const slash = noScheme.indexOf('/');
      const bucket = noScheme.slice(0, slash);
      const name = noScheme.slice(slash + 1);
      const [buf] = await admin.storage().bucket(bucket).file(name).download();
      return buf;
    }
    try { const res = await fetch(uri as any); const arr = await res.arrayBuffer(); return Buffer.from(arr); } catch { return null; }
  };

  try {
    const frontBuf = await downloadBuffer(gcsUris.front);
    const backBuf = await downloadBuffer(gcsUris.back);
    if (backBuf) {
      const [visionResp] = await visionClient.annotateImage({ image: { content: backBuf }, features: [{ type: 'BARCODE_DETECTION' as any }, { type: 'TEXT_DETECTION' }] });
      const barcodes = (visionResp as any).barcodeAnnotations || [];
      if (Array.isArray(barcodes) && barcodes.length > 0) {
        machineReadable.qr = barcodes.some((b: any) => (b.format || '').toUpperCase().includes('QR'));
        machineReadable.pdf417 = barcodes.some((b: any) => (b.format || '').toUpperCase().includes('PDF417'));
      } else if (visionResp.textAnnotations && visionResp.textAnnotations.length > 0) {
        const text = visionResp.textAnnotations[0].description || '';
        machineReadable.mrz = /<<|[A-Z]{2}\d{6}[A-Z0-9]/.test(text);
      }
    }
    if (frontBuf) {
      const [result] = await docClient.processDocument({ name: processorName, rawDocument: { content: frontBuf.toString('base64'), mimeType: 'image/jpeg' } } as any);
      const doc: any = result.document || {}; const text: string = doc.text || ''; const entities: any[] = doc.entities || [];
      const avg = entities.length ? entities.reduce((s, e) => s + (e.confidence || 0.7), 0) / entities.length : 0.7;
      confidenceScore = Math.max(confidenceScore, avg);
      const getEnt = (types: string[]) => entities.find(e => types.some(t => (e.type || '').toLowerCase().includes(t)));
      const nameEnt = getEnt(['person','name','full_name']);
      const idEnt = getEnt(['id','document_number','id_number','national_id']);
      const dobEnt = getEnt(['date_of_birth','dob','birth']);
      extractedData = {
        firstName: nameEnt?.properties?.find((p: any) => /first|given/i.test(p.type || ''))?.mentionText || undefined,
        lastName: nameEnt?.properties?.find((p: any) => /last|family/i.test(p.type || ''))?.mentionText || undefined,
        idNumber: idEnt?.mentionText || (text.match(/\b\d{7,10}\b/)?.[0]) || undefined,
        birthDate: dobEnt?.mentionText || (text.match(/\b\d{4}[-\/.]\d{2}[-\/.]\d{2}\b|\b\d{2}[\/.]\d{2}[\/.]\d{4}\b/)?.[0]) || undefined,
      };
    }
    if (machineReadable.qr || machineReadable.pdf417 || machineReadable.mrz) confidenceScore = Math.min(0.99, confidenceScore + 0.1);
  } catch (e) { console.error('[analyzeWithVisionAndDocAI] error', e); }

  await db.runTransaction(async (tx) => {
    tx.set(ref, { provider: 'DocumentAI', confidenceScore, status: 'pending_review', updatedAt: admin.firestore.FieldValue.serverTimestamp(), documentVerification: { success: confidenceScore >= 0.7, reason: confidenceScore >= 0.7 ? 'OCR suficiente' : 'Revisión necesaria' }, extractedData, machineReadable }, { merge: true });
  });
  if (dniNumber) { await db.doc(`dniRegistry/${dniNumber}`).set({ uid, provider: 'DocumentAI', confidenceScore, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); }
  return { ok: true, confidenceScore: Math.round(confidenceScore * 100), extracted: extractedData };
});

// Callable: startPremiumVerification (inicia proveedor)
export const startPremiumVerification = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  const uid = String(data.uid || context.auth.uid);
  const attemptId = String(data.attemptId);
  const attemptPath = `identity_verification_logs/${uid}/attempts/${attemptId}`;
  const ref = db.doc(attemptPath);
  await ref.set({ provider: 'HumiOberif', status: 'pending_review', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

// HTTP: providerWebhook (public, firma HMAC X-HO-Signature)
export const providerWebhook = functions.region('us-central1').https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
      const sigHeader = (req.headers['x-ho-signature'] || req.headers['X-HO-Signature'] || '').toString();
      const secret = process.env.HUMIOBERIF_WEBHOOK_SECRET || '';
      if (!secret) { res.status(500).send('Secret not configured'); return; }
      const payload = JSON.stringify(req.body || {});
      const h = crypto.createHmac('sha256', secret); h.update(payload); const digest = h.digest('hex');
      const a = Buffer.from(digest, 'hex'); const b = Buffer.from(sigHeader || '', 'hex');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { res.status(403).send('Invalid signature'); return; }

      const { uid, attemptPath, decision, dniNumber, referenceId, scores } = req.body || {};
      if (!uid || !attemptPath) { res.status(400).send('Missing uid/attemptPath'); return; }
      const ref = db.doc(String(attemptPath));
      const approved = decision === 'approved';
      const review = decision === 'review_needed';
      const status = approved ? 'approved' : (review ? 'pending_review' : 'rejected');
      const attemptStatus = status;

      if (approved && dniNumber) {
        const reg = await db.doc(`dniRegistry/${dniNumber}`).get();
        if (reg.exists && reg.data()?.uid && reg.data()?.uid !== uid && ['verified','banned'].includes(reg.data()?.verificationStatus)) {
          await ref.set({ provider: 'HumiOberif', confidenceScore: Number(scores?.face_match || 0.85), status: 'pending_review', attemptStatus: 'pending_review', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          res.status(200).json({ ok: true, conflict: true });
          return;
        }
      }

      await ref.set({
        provider: 'HumiOberif',
        confidenceScore: Number(scores?.face_match || 0.85),
        status,
        attemptStatus,
        premiumScores: scores || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      if (approved) {
        await db.doc(`users/${uid}`).set({ verificationStatus: 'verified', perfilEstado: 'validada' }, { merge: true });
      }
      if (approved && dniNumber) {
        await db.doc(`dniRegistry/${dniNumber}`).set({
          uid,
          verificationStatus: 'verified',
          provider: 'HumiOberif',
          confidenceScore: Number(scores?.face_match || 0.85),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          referenceId: referenceId || null,
        }, { merge: true });
      }

      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[humiOberifWebhook] error', e);
      res.status(500).json({ ok: false });
    }
  });
});

// Callable: guardDniUniqueness
export const guardDniUniqueness = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  const dniNumber = String(data.dniNumber || '');
  const uid = String(data.uid || context.auth.uid);
  if (!dniNumber) return { ok: true, conflict: false };
  const d = await db.doc(`dniRegistry/${dniNumber}`).get();
  if (!d.exists) return { ok: true, conflict: false };
  const val = d.data() as any;
  const conflict = val.uid && val.uid !== uid && ['verified', 'banned'].includes(val.verificationStatus);
  return { ok: true, conflict };
});
