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
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionsAppleASN = exports.subscriptionsVerifyGooglePurchase = exports.subscriptionsWebhookPaddle = exports.subscriptionsCancelPaddle = exports.subscriptionsGetPaddleUpdateUrl = exports.subscriptionsConfirmPaddle = void 0;
require("./env");
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
async function writeSubscription(uid, payload) {
    await db.doc(`users/${uid}`).set({
        subscription: { ...payload, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    }, { merge: true });
    await db.collection('subscriptions_logs').add({ uid, ...payload, ts: admin.firestore.FieldValue.serverTimestamp() });
}
exports.subscriptionsConfirmPaddle = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    const uid = String(data?.uid || context.auth.uid);
    const plan = String(data?.plan || 'silver');
    const checkout = data?.checkout || {};
    await writeSubscription(uid, {
        plan,
        status: 'active',
        provider: 'Paddle',
        providerRefId: checkout?.subscription_id || checkout?.order?.subscription_id || null,
        invoiceUrl: checkout?.receipt_url || null,
    });
    return { ok: true };
});
exports.subscriptionsGetPaddleUpdateUrl = functions.region('us-central1').https.onCall(async (_data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    const uid = String(context.auth.uid);
    const doc = await db.doc(`users/${uid}`).get();
    const sub = doc.data()?.subscription || {};
    if (sub.paddleUpdateUrl)
        return { url: sub.paddleUpdateUrl };
    return { url: sub.invoiceUrl || null };
});
exports.subscriptionsCancelPaddle = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    const uid = String(context.auth.uid);
    const userSnap = await db.doc(`users/${uid}`).get();
    const sub = userSnap.data()?.subscription || {};
    const subscription_id = sub?.providerRefId || data?.subscription_id;
    const vendorId = process.env.PADDLE_VENDOR_ID;
    const authCode = process.env.PADDLE_AUTH_CODE;
    if (!subscription_id || !vendorId || !authCode)
        throw new functions.https.HttpsError('failed-precondition', 'Paddle config missing');
    const body = new URLSearchParams({ vendor_id: String(vendorId), vendor_auth_code: String(authCode), subscription_id: String(subscription_id) });
    const resp = await fetch('https://vendors.paddle.com/api/2.0/subscription/users_cancel', { method: 'POST', body });
    const json = await resp.json();
    if (json?.success) {
        await writeSubscription(uid, { status: 'canceled' });
        return { ok: true };
    }
    throw new functions.https.HttpsError('internal', 'Paddle cancel failed');
});
exports.subscriptionsWebhookPaddle = functions.region('us-central1').https.onRequest(async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const body = req.body || {};
        const alert = body.alert_name;
        const passthrough = body.passthrough ? JSON.parse(String(body.passthrough)) : {};
        const uid = String(passthrough.uid || '');
        if (!uid) {
            res.status(400).send('Missing uid');
            return;
        }
        const subscription_id = String(body.subscription_id || body.subscription || '');
        const next_bill_date = String(body.next_bill_date || '');
        const update_url = String(body.update_url || '');
        const receipt_url = String(body.receipt_url || body.invoice_url || '');
        // TODO: verify p_signature with PADDLE_PUBLIC_KEY
        switch (alert) {
            case 'subscription_created':
            case 'subscription_updated':
            case 'payment_succeeded':
                await writeSubscription(uid, {
                    plan: String(passthrough.plan || 'silver'),
                    status: 'active',
                    provider: 'Paddle',
                    providerRefId: subscription_id || null,
                    renewalDate: next_bill_date || null,
                    invoiceUrl: receipt_url || null,
                    paddleUpdateUrl: update_url || null,
                });
                break;
            case 'subscription_cancelled':
            case 'subscription_paused':
                await writeSubscription(uid, { status: 'canceled' });
                break;
            default:
                await db.collection('subscriptions_logs').add({ uid, raw: body, ts: admin.firestore.FieldValue.serverTimestamp() });
        }
        res.status(200).json({ ok: true });
    }
    catch (e) {
        console.error('[subscriptionsWebhookPaddle] error', e);
        res.status(500).json({ ok: false });
    }
});
exports.subscriptionsVerifyGooglePurchase = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    const { purchaseToken, plan } = data || {};
    const uid = String(context.auth.uid);
    // TODO: Play Developer API validation
    await writeSubscription(uid, { plan: String(plan || 'silver'), provider: 'GooglePlay', status: 'active', providerRefId: String(purchaseToken || '') });
    return { ok: true };
});
exports.subscriptionsAppleASN = functions.region('us-central1').https.onRequest(async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const body = req.body || {};
        const uid = String(body.uid || '');
        if (!uid) {
            res.status(200).json({ ok: true });
            return;
        }
        await writeSubscription(uid, { provider: 'Apple', status: 'active' });
        res.status(200).json({ ok: true });
    }
    catch (e) {
        console.error('[subscriptionsAppleASN] error', e);
        res.status(500).json({ ok: false });
    }
});
//# sourceMappingURL=subscriptions.js.map