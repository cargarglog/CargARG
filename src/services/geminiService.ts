import { GoogleGenAI, Type } from "@google/genai";
import { Load, User, Location } from '../types';
import { CaptureTarget } from '../components/ChatBot';

const model = 'gemini-2.5-flash';

function getAi() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY no está configurada.');
  return new GoogleGenAI({ apiKey });
}

export async function getChatResponse(
  input: string,
  load: Load,
  user: User,
  userLocation: Location | null
): Promise<{ text: string; sources?: { uri: string; title: string }[] }> {
  const systemInstruction = `Responde en español como Asistente de CargARG.`;
  const loadDetails = `Origen: ${load.startLocation.address}\nDestino: ${load.endLocation.address}`;
  const userContext = `Rol: ${user.role === 'driver' ? 'Conductor' : 'Empresa'}\nUbicación: ${userLocation ? `${userLocation.lat}, ${userLocation.lng}` : 'No disponible'}`;
  const prompt = `Contexto:\n${loadDetails}\n${userContext}\nPregunta: "${input}"`;
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({ model, contents: prompt, config: { systemInstruction } });
    return { text: response.text };
  } catch {
    return { text: 'No pude responder ahora. Intenta nuevamente.' };
  }
}

export async function analyzeImageForVerification(
  imageDataBase64: string,
  step: CaptureTarget
): Promise<{ ready: boolean; feedback: string }> {
  const base = `Devuelve solo JSON {"ready": boolean, "feedback": "string"}.`;
  let prompt = '';
  switch (step) {
    case 'dniFront':
      prompt = `${base} Verifica nitidez/iluminación y que sea el FRENTE del documento; completo y centrado.`; break;
    case 'dniBack':
      prompt = `${base} Verifica DORSO del DNI (QR/barras, trámite, microtexto, zonas de seguridad); acepta si hay indicios claros.`; break;
    case 'licenseFront':
      prompt = `${base} Verifica FRENTE de licencia (texto "Licencia", categoría, foto, vigencia); horizontal y completa.`; break;
    case 'licenseBack':
      prompt = `${base} Verifica DORSO de licencia (QR/códigos, microtexto, zonas de seguridad); horizontal y completo.`; break;
    case 'selfie':
      prompt = `${base} Selfie clara de un solo rostro, mirando al frente y bien iluminada.`; break;
    default:
      prompt = base;
  }
  const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageDataBase64 } };
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [imagePart, { text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: { ready: { type: Type.BOOLEAN }, feedback: { type: Type.STRING } },
        },
      },
    });
    return JSON.parse(response.text.trim());
  } catch {
    return { ready: false, feedback: 'Error de análisis. Intenta de nuevo.' };
  }
}

export async function checkDocumentConsistency(
  dniFront: string,
  dniBack: string,
  selfie: string,
  dniNumber: string
): Promise<{ success: boolean; reason: string }> {
  const prompt = `Valida consistencia general de frente/dorso y selfie. Responde solo JSON {"success": boolean, "reason": "string"}.`;
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [
        { inlineData: { mimeType: 'image/jpeg', data: dniFront } },
        { inlineData: { mimeType: 'image/jpeg', data: dniBack } },
        { inlineData: { mimeType: 'image/jpeg', data: selfie } },
        { text: prompt }
      ] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: { type: Type.OBJECT, properties: { success: { type: Type.BOOLEAN }, reason: { type: Type.STRING } }, required: ['success','reason'] }
      }
    });
    return JSON.parse(response.text.trim());
  } catch {
    return { success: false, reason: 'Error al analizar los documentos.' };
  }
}

export async function getDrivingDistance(origin: Location, destination: string): Promise<number | null> {
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({ model, contents: `Distancia en km entre (${origin.lat}, ${origin.lng}) y "${destination}". Solo número.` });
    const n = parseFloat(response.text.trim().replace(',', '.'));
    return isNaN(n) ? null : n;
  } catch { return null; }
}

