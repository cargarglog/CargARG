import * as firestore from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { SubscriptionRecord } from './types';

export const subscriptionField = 'subscription';

export async function setInitialFreePlanIfMissing(uid?: string) {
  const id = uid || auth.currentUser?.uid;
  if (!id) return;
  const userRef = firestore.doc(db, 'users', id);
  const snap = await firestore.getDoc(userRef);
  if (!snap.exists()) return;
  const data = snap.data() as any;
  if (!data[subscriptionField]) {
    await firestore.setDoc(
      userRef,
      {
        [subscriptionField]: {
          plan: 'free',
          status: 'active',
          provider: 'Unknown',
          updatedAt: firestore.serverTimestamp(),
        } satisfies SubscriptionRecord,
      },
      { merge: true }
    );
  }
}

export async function updateSubscription(uid: string, values: Partial<SubscriptionRecord>) {
  const userRef = firestore.doc(db, 'users', uid);
  await firestore.setDoc(
    userRef,
    { [subscriptionField]: { ...values, updatedAt: firestore.serverTimestamp() } },
    { merge: true }
  );
}

export function subscribeToSubscription(uid: string, cb: (s: SubscriptionRecord | null) => void) {
  const userRef = firestore.doc(db, 'users', uid);
  return firestore.onSnapshot(userRef, (snap) => {
    const data = snap.data() as any;
    cb((data?.[subscriptionField] as SubscriptionRecord) || null);
  });
}

export async function appendLog(uid: string, entry: Record<string, any>) {
  const logRef = firestore.collection(db, 'subscriptions_logs');
  await firestore.addDoc(logRef, {
    uid,
    ...entry,
    ts: firestore.serverTimestamp(),
  });
}

