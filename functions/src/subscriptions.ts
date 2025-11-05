import './env';
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Util: update subscription doc under users/{uid}
async function writeSubscription(uid: string, payload: Record<string, any>) {
  await db.doc(`users/${uid}`).set({
    subscription: {
      ...payload,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  }, { merge: true });
  await db.collection('subscriptions_logs').add({ uid, ...payload, ts: admin.firestore.FieldValue.serverTimestamp() });
}

export const subscriptionsConfirmPaddle = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  const uid = String(data?.uid || context.auth.uid);
  const plan = String(data?.plan || 'silver');
  const checkout = data?.checkout || {};
  // Security note: the authoritative source will be the webhook; this call only writes a pending/optimistic state
  await writeSubscription(uid, {
    plan,
    status: 'active',
    provider: 'Paddle',
    providerRefId: checkout?.subscription_id || checkout?.order?.subscription_id || null,
    invoiceUrl: checkout?.receipt_url || null,
  });
  return { ok: true };
});

export const subscriptionsGetPaddleUpdateUrl = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  const uid = String(context.auth.uid);
  const doc = await db.doc(`users/${uid}`).get();
  const sub = (doc.data() as any)?.subscription || {};
  // If we stored update_url from webhook, return it.
  if (sub.paddleUpdateUrl) return { url: sub.paddleUpdateUrl };
  return { url: sub.invoiceUrl || null };
});

export const subscriptionsCancelPaddle = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  const uid = String(context.auth.uid);
  const userSnap = await db.doc(`users/${uid}`).get();
  const sub = (userSnap.data() as any)?.subscription || {};
  const subscription_id = sub?.providerRefId || data?.subscription_id;
  const vendorId = process.env.PADDLE_VENDOR_ID;
  const authCode = process.env.PADDLE_AUTH_CODE;
  if (!subscription_id || !vendorId || !authCode) throw new functions.https.HttpsError('failed-precondition', 'Paddle config missing');
  // Classic Paddle endpoint
  const body = new URLSearchParams({ vendor_id: String(vendorId), vendor_auth_code: String(authCode), subscription_id: String(subscription_id) });
  const resp = await fetch('https://vendors.paddle.com/api/2.0/subscription/users_cancel', { method: 'POST', body });
  const json = await resp.json();
  if (json?.success) {
    await writeSubscription(uid, { status: 'canceled' });
    return { ok: true };
  }
  throw new functions.https.HttpsError('internal', 'Paddle cancel failed');
});

export const subscriptionsWebhookPaddle = functions.region('us-central1').https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    const body = req.body || {};
    const alert = body.alert_name as string;
    const passthrough = body.passthrough ? JSON.parse(String(body.passthrough)) : {};
    const uid = String(passthrough.uid || '');
    if (!uid) { res.status(400).send('Missing uid'); return; }
    const subscription_id = String(body.subscription_id || body.subscription || '');
    const next_bill_date = String(body.next_bill_date || '');
    const update_url = String(body.update_url || '');
    const receipt_url = String(body.receipt_url || body.invoice_url || '');
    // TODO: Verify p_signature with PADDLE_PUBLIC_KEY for Classic Paddle webhooks
    switch (alert) {
      case 'subscription_created':
      case 'subscription_updated':
      case 'payment_succeeded': {
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
      }
      case 'subscription_cancelled':
      case 'subscription_paused': {
        await writeSubscription(uid, { status: 'canceled' });
        break;
      }
      default:
        await db.collection('subscriptions_logs').add({ uid, raw: body, ts: admin.firestore.FieldValue.serverTimestamp() });
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[subscriptionsWebhookPaddle] error', e);
    res.status(500).json({ ok: false });
  }
});

// Placeholders for Google/Apple validation (implement with respective APIs)
export const subscriptionsVerifyGooglePurchase = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  const { purchaseToken, productId, packageName, plan } = data || {};
  const uid = String(context.auth.uid);
  // TODO: call Google Play Developer API to validate purchaseToken and get expiryTimeMillis
  await writeSubscription(uid, {
    plan: String(plan || 'silver'),
    provider: 'GooglePlay',
    status: 'active',
    providerRefId: String(purchaseToken || ''),
  });
  return { ok: true };
});

export const subscriptionsAppleASN = functions.region('us-central1').https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    const body = req.body || {};
    // TODO: verify Apple JWS and map to uid via appAccountToken in transaction
    const uid = String(body.uid || '');
    if (!uid) { res.status(200).json({ ok: true }); return; }
    await writeSubscription(uid, { provider: 'Apple', status: 'active' });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[subscriptionsAppleASN] error', e);
    res.status(500).json({ ok: false });
  }
});
