import { GoogleGenAI, Type } from "@google/genai";
import { Load, User, Location, PaymentDetails } from '../types';
import { CaptureTarget } from '../components/ChatBot';

const model = 'gemini-2.5-flash';

const EARTH_RADIUS_KM = 6371;

type RuleBasedAnswer = {
  directHit?: string;
  summary: string;
};

function getAi() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY no está configurada.');
  return new GoogleGenAI({ apiKey });
}

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const includesAny = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.includes(keyword));

const formatList = (items: string[]) => {
  if (items.length === 1) return items[0];
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(', ')} y ${last}`;
};

const translateStatus = (status: Load['status']) => {
  switch (status) {
    case 'available':
      return 'disponible para asignar';
    case 'in_progress':
      return 'en curso';
    case 'completed':
      return 'completada';
    default:
      return status;
  }
};

const describePayment = (details?: PaymentDetails | null) => {
  if (!details) return null;
  const methodLabels =
    details.methods && details.methods.length
      ? details.methods
      : details.method
        ? [details.method]
        : [];

  const labelMap: Record<string, string> = {
    cheque: 'cheque',
    efectivo: 'efectivo',
    transferencia: 'transferencia',
  };
  const formattedMethods =
    methodLabels.length > 0 ? formatList(methodLabels.map((m) => labelMap[m] || m)) : null;

  const pieces: string[] = [];
  if (formattedMethods) {
    pieces.push(`Forma de pago: ${formattedMethods}.`);
  }
  if (details.terms) {
    pieces.push(`Condiciones: ${details.terms}.`);
  }
  if (typeof details.chequeDays === 'number') {
    pieces.push(`Los cheques se abonan a ${details.chequeDays} días.`);
  }
  if (details.splitOriginDestination) {
    const originPercent = typeof details.originPercent === 'number' ? details.originPercent : 50;
    const destinationPercent =
      typeof details.destinationPercent === 'number'
        ? details.destinationPercent
        : Math.max(0, 100 - originPercent);
    pieces.push(`Pago fraccionado: ${originPercent}% en origen y ${destinationPercent}% en destino.`);
  }
  return pieces.length ? pieces.join(' ') : null;
};

const formatCurrency = (amount: number, currency: Load['currency'] = 'ARS') => {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
};

const buildLoadSummary = (load: Load) => {
  const parts: string[] = [
    `Carga ${load.id.substring(0, 6)} publicada por ${load.company}.`,
    `Recorrido: ${load.startLocation.address} → ${load.endLocation.address}.`,
    load.cargoDetails ? `Detalle: ${load.cargoDetails}.` : null,
    load.requiredTruckType?.length
      ? `Unidad requerida: ${formatList(load.requiredTruckType)}${load.otherTruckType ? ` (${load.otherTruckType})` : ''
      }.`
      : load.otherTruckType
        ? `Unidad sugerida: ${load.otherTruckType}.`
        : null,
    `Tarifa propuesta: ${formatCurrency(load.price, load.currency)}.`,
    describePayment(load.paymentDetails),
    load.requirements?.length ? `Requisitos: ${formatList(load.requirements)}.` : null,
    load.distanceKm ? `Distancia estimada: ${load.distanceKm} km.` : null,
  ].filter(Boolean) as string[];
  return parts.join(' ');
};

const haversineKm = (a: Location, b: Location) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(EARTH_RADIUS_KM * c);
};

const buildRuleBasedResponse = (
  input: string,
  load: Load,
  user: User,
  userLocation: Location | null
): RuleBasedAnswer => {
  const summary = buildLoadSummary(load);
  const normalized = normalizeText(input);
  if (!normalized) {
    return { summary };
  }

  const responses: string[] = [];

  if (includesAny(normalized, ['origen', 'salida', 'retiro', 'pickup', 'cargar', 'donde carga'])) {
    responses.push(`El retiro está confirmado en ${load.startLocation.address}.`);
  }

  if (includesAny(normalized, ['destino', 'entrega', 'descarga', 'llega', 'donde entrega'])) {
    responses.push(`La entrega se realiza en ${load.endLocation.address}.`);
  }

  if (includesAny(normalized, ['precio', 'pago', 'paga', 'tarifa', 'cuanto cobran', 'cuanto pagan', 'costo'])) {
    responses.push(`La tarifa ofrecida es ${formatCurrency(load.price, load.currency)}.`);
    const paymentDescription = describePayment(load.paymentDetails);
    if (paymentDescription) {
      responses.push(paymentDescription);
    }
  }

  if (includesAny(normalized, ['carga', 'mercaderia', 'mercaderia', 'producto', 'material', 'contenido'])) {
    responses.push(`La carga consiste en ${load.cargoDetails}.`);
  }

  if (includesAny(normalized, ['camion', 'unidad', 'equipo', 'semirremolque', 'trailer'])) {
    if (load.requiredTruckType?.length) {
      responses.push(`Se solicita ${formatList(load.requiredTruckType)}.`);
    } else if (load.otherTruckType) {
      responses.push(`La publicación menciona: ${load.otherTruckType}.`);
    } else {
      responses.push('No hay una unidad específica indicada, cualquier camión habilitado puede postularse.');
    }
  }

  if (includesAny(normalized, ['requisito', 'papel', 'document', 'seguro', 'habilitacion'])) {
    if (load.requirements?.length) {
      responses.push(`Requisitos: ${formatList(load.requirements)}.`);
    } else {
      responses.push('No se listaron requisitos adicionales, solo la documentación habitual.');
    }
  }

  if (includesAny(normalized, ['empresa', 'publica', 'cliente', 'cargador'])) {
    responses.push(`La carga fue publicada por ${load.company}.`);
  }

  if (includesAny(normalized, ['estado', 'status', 'situacion', 'avance'])) {
    responses.push(`El viaje figura como ${translateStatus(load.status)}.`);
  }

  if (includesAny(normalized, ['distancia', 'recorrido', 'kilometro', 'km'])) {
    if (load.distanceKm) {
      responses.push(`El recorrido estimado es de ${load.distanceKm} km.`);
    } else {
      responses.push('Aún no tenemos una distancia estimada calculada.');
    }
  }

  if (userLocation && includesAny(normalized, ['cerca de mi', 'distancia a mi', 'lejos de mi', 'desde mi ubicacion'])) {
    const km = haversineKm(userLocation, load.startLocation);
    responses.push(`Estás aproximadamente a ${km} km del punto de carga.`);
  }

  if (responses.length) {
    return { directHit: responses.join(' '), summary };
  }

  return { summary };
};

const buildPromptContext = (load: Load, user: User, userLocation: Location | null) => {
  const lines = [
    `ID carga: ${load.id}`,
    `Empresa: ${load.company}`,
    `Estado: ${translateStatus(load.status)}`,
    `Origen: ${load.startLocation.address}`,
    `Destino: ${load.endLocation.address}`,
    load.cargoDetails ? `Detalle de carga: ${load.cargoDetails}` : null,
    load.requiredTruckType?.length
      ? `Camión requerido: ${formatList(load.requiredTruckType)}`
      : load.otherTruckType
        ? `Camión sugerido: ${load.otherTruckType}`
        : null,
    `Tarifa: ${formatCurrency(load.price, load.currency)}`,
    load.requirements?.length ? `Requisitos: ${formatList(load.requirements)}` : null,
    describePayment(load.paymentDetails),
    load.distanceKm ? `Distancia estimada: ${load.distanceKm} km` : null,
    `Consulta realizada por un ${user.role === 'driver' ? 'conductor' : 'publicador'}.`,
    userLocation ? `Ubicación aproximada del usuario: ${userLocation.lat},${userLocation.lng}` : null,
  ].filter(Boolean) as string[];
  return lines.join('\n');
};

export async function getChatResponse(
  input: string,
  load: Load,
  user: User,
  userLocation: Location | null
): Promise<{ text: string; sources?: { uri: string; title: string }[] }> {
  const ruleBased = buildRuleBasedResponse(input, load, user, userLocation);
  if (ruleBased.directHit) {
    return { text: ruleBased.directHit };
  }

  try {
    const systemInstruction = `Responde con tono profesional, en español neutro, y solo utiliza información confirmada de la carga.`;
    const ai = getAi();
    const context = buildPromptContext(load, user, userLocation);
    const prompt = `Contexto confirmado:\n${context}\nPregunta: "${input}"`;
    const response = await ai.models.generateContent({ model, contents: prompt, config: { systemInstruction } });
    const text = (response.text || '').trim();
    if (text) {
      return { text };
    }
  } catch (error) {
    console.warn('[geminiService] Respuesta determinística utilizada por error en Gemini', error);
  }

  return { text: ruleBased.summary };
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

