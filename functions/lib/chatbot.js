"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatbotFunction = void 0;
exports.maskPII = maskPII;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const speech_1 = require("@google-cloud/speech");
const db = admin.firestore();
const speechClient = new speech_1.SpeechClient();
const LOGISTICS_KEYWORDS = [
    'carga',
    'camion',
    'camión',
    'viaje',
    'chofer',
    'logistica',
    'logística',
    'mercaderia',
    'mercadería',
    'contenedor',
    'depósito',
    'deposito',
    'entrega',
    'retiro',
    'trailer',
    'acoplado',
    'remito',
    'aduana',
    'puerto',
    'terminal',
    'transporte',
    'bodega',
    'embarque',
    'descarga',
    'kilometro',
    'kilómetro',
    'km',
    'peso',
    'guia',
    'guía',
    'checklist',
    'planilla',
    'ruta',
];
const NON_LOGISTICS_KEYWORDS = [
    'clima',
    'chiste',
    'chistes',
    'salud',
    'medico',
    'médico',
    'doctor',
    'farmacia',
    'deporte',
    'receta',
    'pelicula',
    'película',
    'musica',
    'música',
    'broma',
];
const INCIDENT_KEYWORDS = [
    { keyword: 'falla', severity: 'high' },
    { keyword: 'fallo', severity: 'high' },
    { keyword: 'averia', severity: 'high' },
    { keyword: 'avería', severity: 'high' },
    { keyword: 'demora', severity: 'medium' },
    { keyword: 'retraso', severity: 'medium' },
    { keyword: 'demorado', severity: 'medium' },
    { keyword: 'accidente', severity: 'critical' },
    { keyword: 'choque', severity: 'critical' },
    { keyword: 'incidente', severity: 'critical' },
    { keyword: 'pinchazo', severity: 'high' },
    { keyword: 'parado', severity: 'medium' },
    { keyword: 'rotura', severity: 'high' },
    { keyword: 'romp', severity: 'high' },
];
exports.chatbotFunction = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Se requiere autenticación.');
    }
    const conversationId = (data.conversationId || '').trim();
    if (!conversationId) {
        throw new functions.https.HttpsError('invalid-argument', 'conversationId es obligatorio.');
    }
    const messagesRef = db.collection('chats').doc(conversationId).collection('messages');
    const role = (data.role || 'driver').trim();
    const userId = data.userId ? String(data.userId) : context.auth.uid;
    const tripId = data.tripId ? String(data.tripId) : undefined;
    const languageCode = (data.languageCode || process.env.CHATBOT_DEFAULT_LANG || 'es-419').toString();
    const clientMeta = sanitizeClientMeta(data.meta);
    let workingText = typeof data.message === 'string' ? data.message.trim() : '';
    const derivedMeta = {};
    if (data.audioBase64) {
        const transcript = await transcribeAudio(data.audioBase64, languageCode);
        if (transcript) {
            const maskedTranscript = maskPII(transcript);
            const transcriptMeta = { ...clientMeta, source: 'audio' };
            const transcriptDoc = await messagesRef.add({
                role,
                userId,
                type: 'transcript',
                content: maskedTranscript.content,
                flags: { blockedContactShare: maskedTranscript.blocked },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                meta: Object.keys(transcriptMeta).length ? transcriptMeta : undefined,
            });
            derivedMeta.transcriptId = transcriptDoc.id;
            workingText = maskedTranscript.content;
        }
    }
    if (!workingText) {
        throw new functions.https.HttpsError('invalid-argument', 'No se recibió texto para procesar.');
    }
    const masked = maskPII(workingText);
    const messageMeta = { ...clientMeta };
    const messageRef = await messagesRef.add({
        role,
        userId,
        type: 'text',
        content: masked.content,
        flags: { blockedContactShare: masked.blocked },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        meta: Object.keys(messageMeta).length ? messageMeta : undefined,
    });
    const lower = masked.content.toLowerCase();
    const isLogisticsQuery = await classifyLogisticsIntent(lower);
    if (!isLogisticsQuery) {
        const reply = 'Solo puedo ayudarte con temas de la carga o el viaje actual.';
        await messagesRef.add({
            role: 'bot',
            type: 'text',
            content: reply,
            replyTo: messageRef.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return {
            ok: true,
            domainBlocked: true,
            blockedPII: masked.blocked,
            reply,
        };
    }
    const incident = analyzeIncidents(lower);
    let confirmedInfo = {};
    if (tripId) {
        const tripSnap = await db.collection('trips').doc(tripId).get();
        if (tripSnap.exists) {
            confirmedInfo = extractConfirmedInfo(tripSnap.data() || {});
        }
    }
    const reply = generateLogisticsReply(masked.content, confirmedInfo);
    const finalReply = reply || 'Esa información aún no fue confirmada por logística.';
    const botRef = await messagesRef.add({
        role: 'bot',
        type: 'text',
        content: finalReply,
        replyTo: messageRef.id,
        meta: {
            usedConfirmedInfo: Object.keys(confirmedInfo).length > 0,
            missingInfo: !reply,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (incident.shouldNotify && tripId) {
        const summary = summarizeForLogistics(masked.content, incident.matches);
        const logisticsEvent = await db
            .collection('trips')
            .doc(tripId)
            .collection('events')
            .add({
            type: 'logistics-notify',
            summary,
            sourceMessageId: messageRef.id,
            triggeredBy: userId,
            severity: incident.severity,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        derivedMeta.notifyLogistics = true;
        derivedMeta.logisticsEventId = logisticsEvent.id;
    }
    await messageRef.update({
        meta: {
            ...messageMeta,
            ...derivedMeta,
            incidentDetected: incident.shouldNotify,
        },
        replyMessageId: botRef.id,
    });
    return {
        ok: true,
        reply: finalReply,
        blockedPII: masked.blocked,
        domainBlocked: false,
        incidentNotified: incident.shouldNotify,
    };
});
function sanitizeClientMeta(raw) {
    if (!raw || typeof raw !== 'object')
        return {};
    const safe = {};
    if (Object.prototype.hasOwnProperty.call(raw, 'tripChatActive')) {
        safe.tripChatActive = Boolean(raw.tripChatActive);
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'ttsMuted')) {
        safe.ttsMuted = Boolean(raw.ttsMuted);
    }
    return safe;
}
async function transcribeAudio(audioBase64, languageCode) {
    const trimmed = audioBase64.trim();
    if (!trimmed)
        return '';
    if (process.env.WHISPER_API_URL) {
        try {
            const url = process.env.WHISPER_API_URL;
            const headers = { 'Content-Type': 'application/json' };
            if (process.env.WHISPER_API_KEY) {
                headers.Authorization = `Bearer ${process.env.WHISPER_API_KEY}`;
            }
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    audio: trimmed,
                    language: languageCode,
                }),
            });
            if (response.ok) {
                const json = (await response.json());
                if (json?.text)
                    return String(json.text).trim();
            }
            else {
                console.warn('[chatbot] Whisper API respondió', response.status, await response.text());
            }
        }
        catch (err) {
            console.error('[chatbot] Error invocando Whisper API', err);
        }
    }
    try {
        const [result] = await speechClient.recognize({
            audio: { content: trimmed },
            config: {
                languageCode,
                enableAutomaticPunctuation: true,
                model: process.env.CHATBOT_SPEECH_MODEL || 'default',
            },
        });
        const transcript = result.results
            ?.map((r) => r.alternatives?.[0]?.transcript || '')
            .join(' ')
            .trim();
        return transcript || '';
    }
    catch (err) {
        console.error('[chatbot] Error en transcripción con Speech-to-Text', err);
        return '';
    }
}
async function classifyLogisticsIntent(text) {
    const positiveHits = LOGISTICS_KEYWORDS.filter((k) => text.includes(k)).length;
    const negativeHits = NON_LOGISTICS_KEYWORDS.filter((k) => text.includes(k)).length;
    if (positiveHits === 0 && negativeHits > 0)
        return false;
    if (positiveHits > 0)
        return true;
    if (!process.env.OPENAI_API_KEY) {
        return false;
    }
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: process.env.CHATBOT_CLASSIFIER_MODEL || 'gpt-4o-mini',
                temperature: 0,
                messages: [
                    {
                        role: 'system',
                        content: 'Responde SOLO con "si" o "no". Di "si" si el mensaje está relacionado con cargas, transporte o logística. De lo contrario responde "no".',
                    },
                    { role: 'user', content: text },
                ],
            }),
        });
        if (!response.ok) {
            console.warn('[chatbot] Clasificador OpenAI rechazó la solicitud', response.status);
            return false;
        }
        const json = (await response.json());
        const answer = json?.choices?.[0]?.message?.content?.toString().trim().toLowerCase();
        return answer === 'si' || answer === 'sí';
    }
    catch (err) {
        console.error('[chatbot] Error en clasificación con OpenAI', err);
        return false;
    }
}
function maskPII(text) {
    const emailsRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
    const phoneRegex = /(\+?\d[\d\s().-]{7,}\d)/g;
    const urlRegex = /\b(?:https?:\/\/|www\.)\S+\b/gi;
    const locationRegex = /\b(calle|avenida|av\.|ruta|km|kil[oó]metro|pasaje|paso|esquina)\s+[0-9a-záéíóúüñ#\s.-]{2,}/gi;
    let blocked = false;
    let emails = 0;
    let phones = 0;
    let urls = 0;
    let locations = 0;
    let coordinates = 0;
    const replaceWith = (match) => {
        blocked = true;
        return '[PII BLOQUEADA]';
    };
    const contentAfterEmails = text.replace(emailsRegex, (match) => {
        emails += 1;
        return replaceWith(match);
    });
    const contentAfterPhones = contentAfterEmails.replace(phoneRegex, (match) => {
        const digits = match.replace(/\D/g, '');
        if (digits.length < 7)
            return match;
        phones += 1;
        return replaceWith(match);
    });
    const contentAfterUrls = contentAfterPhones.replace(urlRegex, (match) => {
        urls += 1;
        return replaceWith(match);
    });
    const coordinateRegex = /\b-?\d{1,2}\.\d{3,}(?:\s*,\s*|\s+)-?\d{1,3}\.\d{3,}\b/g;
    const contentAfterCoordinates = contentAfterUrls.replace(coordinateRegex, (match) => {
        coordinates += 1;
        return replaceWith(match);
    });
    const finalContent = contentAfterCoordinates.replace(locationRegex, (match) => {
        locations += 1;
        return replaceWith(match);
    });
    return {
        content: finalContent,
        blocked,
        matches: { emails, locations, phones, urls, coordinates },
    };
}
function analyzeIncidents(text) {
    const matches = INCIDENT_KEYWORDS.filter((k) => text.includes(k.keyword));
    if (!matches.length) {
        return { shouldNotify: false, severity: 'medium', matches: [] };
    }
    const severities = matches.map((k) => k.severity);
    const severity = severities.includes('critical')
        ? 'critical'
        : severities.includes('high')
            ? 'high'
            : 'medium';
    return { shouldNotify: true, severity, matches: matches.map((m) => m.keyword) };
}
function extractConfirmedInfo(raw) {
    const result = {};
    const walk = (node, path, parentConfirmed) => {
        if (node == null)
            return;
        if (Array.isArray(node)) {
            node.forEach((item, index) => walk(item, [...path, String(index)], parentConfirmed));
            return;
        }
        if (typeof node === 'object') {
            const status = String(node.status || node.state || '').toLowerCase();
            const flag = parentConfirmed || node.confirmed === true || status === 'confirmed';
            const value = node.value ?? node.text ?? node.data;
            if (flag && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
                result[path.join('.')] = String(value);
            }
            for (const [key, child] of Object.entries(node)) {
                if (['value', 'confirmed', 'status', 'state', 'updatedAt', 'confirmedAt', 'createdAt', 'history'].includes(key)) {
                    continue;
                }
                const childPath = [...path, key];
                walk(child, childPath, flag || key.toLowerCase().includes('confirm'));
            }
            return;
        }
        if (parentConfirmed && path.length) {
            result[path.join('.')] = String(node);
        }
    };
    const candidates = [
        raw?.logisticsConfirmed,
        raw?.confirmedLogistics,
        raw?.logistics?.confirmed,
        raw?.confirmedData,
    ];
    let hasConfirmedData = false;
    for (const candidate of candidates) {
        const sizeBefore = Object.keys(result).length;
        walk(candidate, [], false);
        if (Object.keys(result).length > sizeBefore) {
            hasConfirmedData = true;
        }
    }
    if (!hasConfirmedData) {
        walk(raw?.logistics, [], false);
    }
    return result;
}
function generateLogisticsReply(message, info) {
    const availableEntries = Object.entries(info);
    if (!availableEntries.length)
        return null;
    const lower = message.toLowerCase();
    const findByKeys = (substrings) => {
        for (const [key, value] of availableEntries) {
            const normalized = key.toLowerCase();
            if (substrings.some((substr) => normalized.includes(substr))) {
                return value;
            }
        }
        return null;
    };
    if (/\b(eta|arribo|llegad|arrive|arrival|hora estimada|cuando lleg)\b/.test(lower)) {
        const eta = findByKeys(['eta', 'arrival', 'arribo', 'arrivaltime', 'estimated']);
        if (eta) {
            return `La última hora estimada de arribo confirmada por logística es ${eta}.`;
        }
        return null;
    }
    if (/\b(dónde|donde|ubicaci[oó]n|checkpoint|parada|posición|posicion)\b/.test(lower)) {
        const location = findByKeys(['location', 'checkpoint', 'posicion', 'ubicacion', 'currentstop']) ||
            findByKeys(['lastknownlocation']);
        if (location) {
            return `La ubicación confirmada más reciente es ${location}.`;
        }
        return null;
    }
    if (/\b(estado|status|situaci[oó]n|avance|progreso)\b/.test(lower)) {
        const status = findByKeys(['status', 'estado', 'progress', 'situacion']);
        if (status) {
            return `El estado confirmado del viaje es: ${status}.`;
        }
        return null;
    }
    if (/\b(document|remito|papel|cmr|nota de pedido)\b/.test(lower)) {
        const docs = findByKeys(['document', 'remito', 'documentacion', 'paperwork']);
        if (docs) {
            return `Documentación confirmada: ${docs}.`;
        }
        return null;
    }
    if (/\b(carga|mercader[ií]a|mercancia|producto|material)\b/.test(lower)) {
        const load = findByKeys(['load', 'carga', 'shipment', 'mercader', 'contenido']) ||
            findByKeys(['weight', 'peso']);
        if (load) {
            return `Detalle confirmado de la carga: ${load}.`;
        }
    }
    const formatted = availableEntries.slice(0, 4).map(([key, value]) => `${formatKey(key)}: ${value}`);
    if (!formatted.length)
        return null;
    return `Esto es lo que logística confirmó hasta ahora: ${formatted.join('; ')}.`;
}
function summarizeForLogistics(content, keywords) {
    const base = content.length > 280 ? `${content.slice(0, 277)}...` : content;
    if (!keywords.length)
        return base;
    return `${base} (detalles detectados: ${keywords.join(', ')})`;
}
function formatKey(key) {
    const normalized = key.toLowerCase();
    if (normalized.includes('eta') || normalized.includes('arrival'))
        return 'ETA confirmada';
    if (normalized.includes('location') || normalized.includes('ubicacion') || normalized.includes('checkpoint')) {
        return 'Ubicación confirmada';
    }
    if (normalized.includes('status') || normalized.includes('estado'))
        return 'Estado';
    if (normalized.includes('load') || normalized.includes('carga'))
        return 'Carga';
    if (normalized.includes('document'))
        return 'Documentación';
    if (normalized.includes('peso') || normalized.includes('weight'))
        return 'Peso';
    return key.replace(/[_\-.]+/g, ' ');
}
//# sourceMappingURL=chatbot.js.map