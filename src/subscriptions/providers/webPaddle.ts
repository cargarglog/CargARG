/* Web provider using Paddle.js (Classic). */
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../firebase';
import type { Plan } from '../../types';
import { updateSubscription, appendLog } from '../firestore';
import type { PurchaseResult } from '../types';

declare global {
  interface Window { Paddle?: any }
}

async function ensurePaddle() {
  if (window.Paddle) return;
  const vendorId = import.meta.env.VITE_PADDLE_VENDOR_ID;
  if (!vendorId) throw new Error('VITE_PADDLE_VENDOR_ID no configurado');
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/paddle.js';
    s.async = true;
    s.onload = () => {
      try { window.Paddle.Setup({ vendor: Number(vendorId) }); resolve(); } catch (e) { reject(e); }
    };
    s.onerror = () => reject(new Error('No se pudo cargar Paddle.js'));
    document.head.appendChild(s);
  });
}

function productIdFor(plan: Plan): string | null {
  switch (plan) {
    case 'silver': return import.meta.env.VITE_PADDLE_PRODUCT_SILVER || null;
    case 'gold': return import.meta.env.VITE_PADDLE_PRODUCT_GOLD || null;
    default: return null;
  }
}

export function createWebPaddleProvider() {
  const provider = {
    id: 'Paddle' as const,
    supportsChangePayment: true,
    async startPurchase(plan: Plan): Promise<PurchaseResult> {
      const uid = auth.currentUser?.uid;
      if (!uid) return { ok: false, message: 'Debe iniciar sesión' };
      if (plan === 'free') {
        await updateSubscription(uid, { plan: 'free', status: 'active', provider: 'Paddle' });
        await appendLog(uid, { action: 'plan_set_free', provider: 'Paddle' });
        return { ok: true };
      }
      const productId = productIdFor(plan);
      if (!productId) return { ok: false, message: 'Producto Paddle no configurado' };
      await ensurePaddle();
      return await new Promise<PurchaseResult>((resolve) => {
        const passthrough = JSON.stringify({ uid, plan });
        try {
          window.Paddle.Checkout.open({
            product: productId,
            passthrough,
            successCallback: async (data: any) => {
              try {
                const confirm = httpsCallable(functions, 'subscriptionsConfirmPaddle');
                const r: any = await confirm({ checkout: data?.checkout || data, plan, uid });
                resolve(r?.data?.ok ? { ok: true } : { ok: false, message: 'No se pudo confirmar el pago' });
              } catch (e: any) {
                resolve({ ok: false, message: e?.message || 'Error al confirmar' });
              }
            },
            closeCallback: () => resolve({ ok: false, message: 'Operación cancelada' }),
          });
        } catch (e: any) {
          resolve({ ok: false, message: e?.message || 'Error al abrir Paddle' });
        }
      });
    },
    async openBillingPortal(): Promise<void> {
      const uid = auth.currentUser?.uid; if (!uid) throw new Error('Sesión requerida');
      const callable = httpsCallable(functions, 'subscriptionsGetPaddleUpdateUrl');
      const res: any = await callable({ uid });
      const url: string | undefined = res?.data?.url;
      if (url) window.open(url, '_blank'); else throw new Error('No hay URL disponible');
    },
    async cancelSubscription(): Promise<PurchaseResult> {
      const uid = auth.currentUser?.uid; if (!uid) return { ok: false, message: 'Sesión requerida' };
      try {
        const callable = httpsCallable(functions, 'subscriptionsCancelPaddle');
        const r: any = await callable({ uid });
        return r?.data?.ok ? { ok: true } : { ok: false, message: 'No se pudo cancelar' };
      } catch (e: any) {
        return { ok: false, message: e?.message || 'Error al cancelar' };
      }
    },
  };
  return provider;
}

