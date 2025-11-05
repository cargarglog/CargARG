import { auth } from '../firebase';
import type { Plan } from '../types';
import type { PurchaseResult } from './types';

export interface SubscriptionProvider {
  id: 'GooglePlay' | 'Apple' | 'Paddle' | 'Unknown';
  supportsChangePayment: boolean;
  startPurchase(plan: Plan): Promise<PurchaseResult>;
  openBillingPortal(): Promise<void>;
  cancelSubscription(): Promise<PurchaseResult>;
}

export type Platform = 'android' | 'ios' | 'web';

export function detectPlatform(): Platform {
  try {
    const anyWin = window as any;
    const cap = anyWin?.Capacitor?.getPlatform?.();
    if (cap === 'android' || cap === 'ios') return cap;
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  } catch {}
  return 'web';
}

export async function getProvider(): Promise<SubscriptionProvider> {
  const platform = detectPlatform();
  if (platform === 'android') {
    const m = await import('./providers/android');
    return m.createAndroidProvider();
  }
  if (platform === 'ios') {
    const m = await import('./providers/ios');
    return m.createIOSProvider();
  }
  const m = await import('./providers/webPaddle');
  return m.createWebPaddleProvider();
}

export function requireAuthUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Debe iniciar sesión para suscribirse.');
  return uid;
}

