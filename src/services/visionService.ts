// Integración de verificación extendida — Servicio Vision API
// Este servicio provee un veredicto de calidad simple para selfie/documentos.

export interface VisionQualityResult {
  ok: boolean;
  confidenceScore: number; // 0..1
  issues?: string[];
}

export async function assessImageQuality(_imageUri: string): Promise<VisionQualityResult> {
  // Placeholder local: integra Vision API desde backend cuando esté disponible.
  // Usamos heurística conservadora: asumimos calidad moderada.
  return { ok: true, confidenceScore: 0.75 };
}

