import type { Plan } from '../../types';
import { auth } from '../../firebase';
import { appendLog, updateSubscription } from '../firestore';
import type { PurchaseResult } from '../types';

declare global {
  interface Window { AndroidBilling?: any }
}

function skuFor(plan: Plan): string | null {
  switch (plan) {
    case 'silver': return import.meta.env.VITE_GOOGLEPLAY_PRODUCT_SILVER || null;
    case 'gold': return import.meta.env.VITE_GOOGLEPLAY_PRODUCT_GOLD || null;
    default: return null;
  }
}

function packageName(): string {
  return import.meta.env.VITE_ANDROID_PACKAGE_NAME || '';
}

export function createAndroidProvider() {
  const provider = {
    id: 'GooglePlay' as const,
    supportsChangePayment: false,
    async startPurchase(plan: Plan): Promise<PurchaseResult> {
      const uid = auth.currentUser?.uid;
      if (!uid) return { ok: false, message: 'Sesión requerida' };
      if (plan === 'free') {
        await updateSubscription(uid, { plan: 'free', status: 'active', provider: 'GooglePlay' });
        await appendLog(uid, { action: 'plan_set_free', provider: 'GooglePlay' });
        return { ok: true };
      }
      const sku = skuFor(plan);
      if (!sku) return { ok: false, message: 'SKU no configurado' };
      try {
        if (window.AndroidBilling?.startSubscription) {
          await window.AndroidBilling.startSubscription(sku);
          return { ok: true };
        }
        const url = `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(sku)}&package=${encodeURIComponent(packageName())}`;
        window.open(url, '_blank');
        return { ok: true };
      } catch (e: any) {
        return { ok: false, message: e?.message || 'Error iniciando compra' };
      }
    },
    async openBillingPortal(): Promise<void> {
      const url = `https://play.google.com/store/account/subscriptions?package=${encodeURIComponent(packageName())}`;
      window.open(url, '_blank');
    },
    async cancelSubscription(): Promise<PurchaseResult> {
      const url = `https://play.google.com/store/account/subscriptions?package=${encodeURIComponent(packageName())}`;
      window.open(url, '_blank');
      return { ok: true };
    },
  };

  if (typeof window !== 'undefined' && !(window as any).__cargarg_billing_listener__) {
    (window as any).__cargarg_billing_listener__ = true;
    window.addEventListener('message', async (ev: MessageEvent) => {
      try {
        const data: any = ev.data || {};
        if (data?.type === 'android.purchase') {
          const uid = auth.currentUser?.uid; if (!uid) return;
          await updateSubscription(uid, {
            plan: (data.plan || 'silver'),
            provider: 'GooglePlay',
            status: 'active',
            providerRefId: data.purchaseToken || data.token,
            renewalDate: data.renewalDate || undefined,
          });
          await appendLog(uid, { action: 'android_purchase', raw: data });
        }
      } catch {}
    });
  }

  return provider;
}

