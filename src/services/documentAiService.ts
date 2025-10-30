// Integración de verificación extendida — Servicio Document AI
// Nota: Este módulo es plug-in. No reemplaza Gemini; se usa en intentos #2.

export interface DocumentAiResult {
  success: boolean;
  confidenceScore: number;
  extractedData?: Record<string, any>;
  reason?: string;
}

export async function processWithDocumentAI(params: {
  dniFrontUri: string;
  dniBackUri?: string;
  licenseFrontUri?: string;
  licenseBackUri?: string;
}): Promise<DocumentAiResult> {
  // Placeholder seguro: conecta con tu backend/proxy de Document AI cuando esté listo.
  // Mantiene la app funcionando sin bloquear.
  try {
    const { dniFrontUri, dniBackUri, licenseFrontUri, licenseBackUri } = params;
    const enough = !!dniFrontUri && !!dniBackUri;
    const scoreBase = enough ? 0.82 : 0.55;
    return {
      success: enough,
      confidenceScore: Math.max(
        0,
        Math.min(0.99, scoreBase + (licenseFrontUri && licenseBackUri ? 0.06 : 0))
      ),
      extractedData: { hasFront: !!dniFrontUri, hasBack: !!dniBackUri },
      reason: enough ? undefined : 'Falta dorso de DNI para OCR completo',
    };
  } catch (e) {
    return { success: false, confidenceScore: 0, reason: 'Error Document AI' };
  }
}

