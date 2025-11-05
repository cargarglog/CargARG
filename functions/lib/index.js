"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.guardDniUniqueness = exports.providerWebhook = exports.startPremiumVerification = exports.analyzeWithVisionAndDocAI = void 0;
// CargARG Identity Extended Integration — Firebase Cloud Functions
// CargARG Identity Extended Integration
require("./env");
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const cors_1 = __importDefault(require("cors"));
const crypto_1 = __importDefault(require("crypto"));
const vision_1 = require("@google-cloud/vision");
const documentai_1 = require("@google-cloud/documentai");
const cors = (0, cors_1.default)({ origin: true });
if (!admin.apps.length)
    admin.initializeApp();
const db = admin.firestore();
// Callable: analyzeWithVisionAndDocAI
exports.analyzeWithVisionAndDocAI = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    }
    const uid = String(data.uid || context.auth.uid);
    const attemptPath = String(data.attemptPath || '');
    const gcsUris = data.gcsUris || {};
    const dniNumber = data.dniNumber || null;
    const ref = db.doc(attemptPath);
    const visionClient = new vision_1.ImageAnnotatorClient();
    const docClient = new documentai_1.DocumentProcessorServiceClient();
    const processorName = `projects/${process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT}/locations/${process.env.DOC_AI_LOCATION}/processors/${process.env.DOC_AI_PROCESSOR_ID}`;
    let confidenceScore = 0.65;
    let extractedData = {};
    let machineReadable = { qr: false, pdf417: false, mrz: false };
    const downloadBuffer = async (uri) => {
        if (!uri)
            return null;
        if (uri.startsWith('gs://')) {
            const noScheme = uri.replace('gs://', '');
            const slash = noScheme.indexOf('/');
            const bucket = noScheme.slice(0, slash);
            const name = noScheme.slice(slash + 1);
            const [buf] = await admin.storage().bucket(bucket).file(name).download();
            return buf;
        }
        try {
            const res = await fetch(uri);
            const arr = await res.arrayBuffer();
            return Buffer.from(arr);
        }
        catch {
            return null;
        }
    };
    try {
        const frontBuf = await downloadBuffer(gcsUris.front);
        const backBuf = await downloadBuffer(gcsUris.back);
        if (backBuf) {
            const [visionResp] = await visionClient.annotateImage({ image: { content: backBuf }, features: [{ type: 'BARCODE_DETECTION' }, { type: 'TEXT_DETECTION' }] });
            const barcodes = visionResp.barcodeAnnotations || [];
            if (Array.isArray(barcodes) && barcodes.length > 0) {
                machineReadable.qr = barcodes.some((b) => (b.format || '').toUpperCase().includes('QR'));
                machineReadable.pdf417 = barcodes.some((b) => (b.format || '').toUpperCase().includes('PDF417'));
            }
            else if (visionResp.textAnnotations && visionResp.textAnnotations.length > 0) {
                const text = visionResp.textAnnotations[0].description || '';
                machineReadable.mrz = /<<|[A-Z]{2}\d{6}[A-Z0-9]/.test(text);
            }
        }
        if (frontBuf) {
            const [result] = await docClient.processDocument({ name: processorName, rawDocument: { content: frontBuf.toString('base64'), mimeType: 'image/jpeg' } });
            const doc = result.document || {};
            const text = doc.text || '';
            const entities = doc.entities || [];
            const avg = entities.length ? entities.reduce((s, e) => s + (e.confidence || 0.7), 0) / entities.length : 0.7;
            confidenceScore = Math.max(confidenceScore, avg);
            const getEnt = (types) => entities.find(e => types.some(t => (e.type || '').toLowerCase().includes(t)));
            const nameEnt = getEnt(['person', 'name', 'full_name']);
            const idEnt = getEnt(['id', 'document_number', 'id_number', 'national_id']);
            const dobEnt = getEnt(['date_of_birth', 'dob', 'birth']);
            extractedData = {
                firstName: nameEnt?.properties?.find((p) => /first|given/i.test(p.type || ''))?.mentionText || undefined,
                lastName: nameEnt?.properties?.find((p) => /last|family/i.test(p.type || ''))?.mentionText || undefined,
                idNumber: idEnt?.mentionText || (text.match(/\b\d{7,10}\b/)?.[0]) || undefined,
                birthDate: dobEnt?.mentionText || (text.match(/\b\d{4}[-\/.]\d{2}[-\/.]\d{2}\b|\b\d{2}[\/.]\d{2}[\/.]\d{4}\b/)?.[0]) || undefined,
            };
        }
        if (machineReadable.qr || machineReadable.pdf417 || machineReadable.mrz)
            confidenceScore = Math.min(0.99, confidenceScore + 0.1);
    }
    catch (e) {
        console.error('[analyzeWithVisionAndDocAI] error', e);
    }
    await db.runTransaction(async (tx) => {
        tx.set(ref, { provider: 'DocumentAI', confidenceScore, status: 'pending_review', updatedAt: admin.firestore.FieldValue.serverTimestamp(), documentVerification: { success: confidenceScore >= 0.7, reason: confidenceScore >= 0.7 ? 'OCR suficiente' : 'Revisión necesaria' }, extractedData, machineReadable }, { merge: true });
    });
    if (dniNumber) {
        await db.doc(`dniRegistry/${dniNumber}`).set({ uid, provider: 'DocumentAI', confidenceScore, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    return { ok: true, confidenceScore: Math.round(confidenceScore * 100), extracted: extractedData };
});
// Callable: startPremiumVerification (inicia proveedor)
exports.startPremiumVerification = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    const uid = String(data.uid || context.auth.uid);
    const attemptId = String(data.attemptId);
    const attemptPath = `identity_verification_logs/${uid}/attempts/${attemptId}`;
    const ref = db.doc(attemptPath);
    await ref.set({ provider: 'HumiOberif', status: 'pending_review', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
});
// HTTP: providerWebhook (public, firma HMAC X-HO-Signature)
exports.providerWebhook = functions.region('us-central1').https.onRequest(async (req, res) => {
    cors(req, res, async () => {
        try {
            if (req.method !== 'POST') {
                res.status(405).send('Method Not Allowed');
                return;
            }
            const sigHeader = (req.headers['x-ho-signature'] || req.headers['X-HO-Signature'] || '').toString();
            const secret = process.env.HUMIOBERIF_WEBHOOK_SECRET || '';
            if (!secret) {
                res.status(500).send('Secret not configured');
                return;
            }
            const payload = JSON.stringify(req.body || {});
            const h = crypto_1.default.createHmac('sha256', secret);
            h.update(payload);
            const digest = h.digest('hex');
            const a = Buffer.from(digest, 'hex');
            const b = Buffer.from(sigHeader || '', 'hex');
            if (a.length !== b.length || !crypto_1.default.timingSafeEqual(a, b)) {
                res.status(403).send('Invalid signature');
                return;
            }
            const { uid, attemptPath, decision, dniNumber, referenceId, scores } = req.body || {};
            if (!uid || !attemptPath) {
                res.status(400).send('Missing uid/attemptPath');
                return;
            }
            const ref = db.doc(String(attemptPath));
            const approved = decision === 'approved';
            const review = decision === 'review_needed';
            const status = approved ? 'approved' : (review ? 'pending_review' : 'rejected');
            const attemptStatus = status;
            if (approved && dniNumber) {
                const reg = await db.doc(`dniRegistry/${dniNumber}`).get();
                if (reg.exists && reg.data()?.uid && reg.data()?.uid !== uid && ['verified', 'banned'].includes(reg.data()?.verificationStatus)) {
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
        }
        catch (e) {
            console.error('[humiOberifWebhook] error', e);
            res.status(500).json({ ok: false });
        }
    });
});
// Callable: guardDniUniqueness
exports.guardDniUniqueness = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    const dniNumber = String(data.dniNumber || '');
    const uid = String(data.uid || context.auth.uid);
    if (!dniNumber)
        return { ok: true, conflict: false };
    const d = await db.doc(`dniRegistry/${dniNumber}`).get();
    if (!d.exists)
        return { ok: true, conflict: false };
    const val = d.data();
    const conflict = val.uid && val.uid !== uid && ['verified', 'banned'].includes(val.verificationStatus);
    return { ok: true, conflict };
});
// Subscriptions (Google/Apple/Paddle)
__exportStar(require("./subscriptions"), exports);
//# sourceMappingURL=index.js.map