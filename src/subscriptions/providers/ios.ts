import type { Plan } from '../../types';
import { auth } from '../../firebase';
import { appendLog, updateSubscription } from '../firestore';
import type { PurchaseResult } from '../types';

declare global {
  interface Window {
    webkit?: { messageHandlers?: { subscriptions?: { postMessage: (msg: any) => void } } };
  }
}

function productIdFor(plan: Plan): string | null {
  switch (plan) {
    case 'silver': return import.meta.env.VITE_APPLE_PRODUCT_SILVER || null;
    case 'gold': return import.meta.env.VITE_APPLE_PRODUCT_GOLD || null;
    default: return null;
  }
}

export function createIOSProvider() {
  const provider = {
    id: 'Apple' as const,
    supportsChangePayment: false,
    async startPurchase(plan: Plan): Promise<PurchaseResult> {
      const uid = auth.currentUser?.uid;
      if (!uid) return { ok: false, message: 'Sesión requerida' };
      if (plan === 'free') {
        await updateSubscription(uid, { plan: 'free', status: 'active', provider: 'Apple' });
        await appendLog(uid, { action: 'plan_set_free', provider: 'Apple' });
        return { ok: true };
      }
      const productId = productIdFor(plan);
      if (!productId) return { ok: false, message: 'Producto no configurado' };
      try {
        // Expected StoreKit 2 bridge via WKWebView message handler
        window.webkit?.messageHandlers?.subscriptions?.postMessage({ action: 'startPurchase', productId, plan });
        return { ok: true };
      } catch (e: any) {
        return { ok: false, message: e?.message || 'Error iniciando compra' };
      }
    },
    async openBillingPortal(): Promise<void> {
      // Redirect to native management
      window.open('https://apps.apple.com/account/subscriptions', '_blank');
    },
    async cancelSubscription(): Promise<PurchaseResult> {
      window.open('https://apps.apple.com/account/subscriptions', '_blank');
      return { ok: true };
    },
  };

  if (typeof window !== 'undefined' && !(window as any).__cargarg_ios_listener__) {
    (window as any).__cargarg_ios_listener__ = true;
    window.addEventListener('message', async (ev: MessageEvent) => {
      try {
        const data: any = ev.data || {};
        if (data?.type === 'ios.purchase') {
          const uid = auth.currentUser?.uid; if (!uid) return;
          await updateSubscription(uid, {
            plan: (data.plan || 'silver'),
            provider: 'Apple',
            status: 'active',
            providerRefId: data.transactionId,
            renewalDate: data.renewalDate || undefined,
          });
          await appendLog(uid, { action: 'ios_purchase', raw: data });
        }
      } catch {}
    });
  }

  return provider;
}

