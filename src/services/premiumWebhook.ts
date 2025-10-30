// Integración de verificación extendida — Webhook Cloud Run Premium (HumiOberif)
// Este servicio llama a un endpoint de Cloud Run (protegido por Secret/Token) para
// biometría/validación avanzada. Mantiene compatibilidad: si falla, no rompe el flujo.

export interface PremiumWebhookResult {
  success: boolean;
  confidenceScore: number;
  referenceId?: string;
  reason?: string;
}

export async function callPremiumWebhook(payload: Record<string, any>): Promise<PremiumWebhookResult> {
  const url = (import.meta as any).env?.VITE_PREMIUM_WEBHOOK_URL as string | undefined;
  const token = (import.meta as any).env?.VITE_PREMIUM_WEBHOOK_TOKEN as string | undefined;
  if (!url) return { success: false, confidenceScore: 0, reason: 'Webhook no configurado' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { success: false, confidenceScore: 0, reason: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return {
      success: !!data.success,
      confidenceScore: typeof data.confidenceScore === 'number' ? data.confidenceScore : 0.8,
      referenceId: data.referenceId,
      reason: data.reason,
    };
  } catch (e) {
    return { success: false, confidenceScore: 0, reason: 'Error de red' };
  }
}

