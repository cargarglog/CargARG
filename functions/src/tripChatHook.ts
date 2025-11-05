import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { maskPII } from './chatbot';

const db = admin.firestore();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

type TripChatMessage = {
  tripId?: string;
  conversationId?: string;
  content?: string;
  type?: string;
  role?: string;
  meta?: Record<string, any>;
  flags?: Record<string, any>;
  [key: string]: any;
};

type ClassificationLabel = 'status_update' | 'technical_issue' | 'delay' | 'accident' | 'emergency';

const HEURISTIC_RULES: Array<{ label: ClassificationLabel; patterns: RegExp[] }> = [
  { label: 'emergency', patterns: [/auxilio/i, /emerg/i, /ambulancia/i, /hospital/i, /\bsocorro\b/i] },
  { label: 'accident', patterns: [/accident/i, /choque/i, /colisi[oó]n/i, /volc[aó]/i, /herido/i, /incidente/i] },
  { label: 'technical_issue', patterns: [/aver[ií]a/i, /falla/i, /romp/i, /neum[aá]tico/i, /motor/i, /mec[aá]n/i] },
  { label: 'delay', patterns: [/demora/i, /tr[aá]fico/i, /retras/i, /desvio/i, /parado/i] },
  { label: 'status_update', patterns: [/lleg[uú]e/i, /sal[ií] ?de/i, /entreg/i, /carg[ao]/i, /continu/i, /avanz/i] },
];

const CLASSIFICATION_FALLBACK: ClassificationLabel = 'status_update';

export const tripChatHook = functions
  .region('us-central1')
  .firestore.document('chats/{conversationId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data() as TripChatMessage | undefined;
    if (!message) return;

    const tripId = message.tripId;
    if (!tripId) return;

    const conversationId = context.params.conversationId;
    const conversationRef = snap.ref.parent?.parent || db.collection('chats').doc(conversationId);

    let conversationData: Record<string, any> | null = null;
    try {
      const conversationSnap = await conversationRef.get();
      conversationData = conversationSnap.exists ? (conversationSnap.data() as Record<string, any>) : null;
    } catch (error) {
      console.error('[tripChatHook] Error leyendo conversación', conversationId, error);
    }

    const driverAccepted =
      Boolean(message.meta?.tripChatActive) ||
      Boolean(message.meta?.driverAccepted) ||
      Boolean(message.meta?.acceptedLoad) ||
      Boolean(conversationData?.driverAccepted) ||
      conversationData?.status === 'accepted' ||
      conversationData?.stage === 'in_transit' ||
      conversationData?.stage === 'trip';

    if (!driverAccepted) return;

    if ((message.role || '').toLowerCase() === 'bot') return;

    const rawText = typeof message.content === 'string' ? message.content : '';
    if (!rawText.trim()) return;

    const masked = maskPII(rawText);
    const summary = await summarizeMessage(masked.content);
    const category = await categorizeMessage(summary || masked.content);

    const ttsMuted =
      Boolean(message.meta?.ttsMuted) ||
      Boolean(message.meta?.muteTTS) ||
      Boolean(message.meta?.muteVoice) ||
      Boolean(conversationData?.ttsMuted);

    const eventPayload = {
      type: 'trip-chat',
      category,
      summary,
      rawMessageId: context.params.messageId,
      conversationId,
      tripId,
      authorRole: message.role || 'unknown',
      flags: {
        blockedPII: masked.blocked,
        piiMatches: masked.matches,
        mutedTTS: ttsMuted,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      notifyLogistics: true,
    };

    try {
      const eventRef = await db.collection('trips').doc(tripId).collection('events').add(eventPayload);
      await conversationRef.set(
        {
          driverAccepted: true,
          ttsMuted,
          lastTripEvent: {
            eventId: eventRef.id,
            category,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );

      await db.collection('logisticsNotifications').add({
        tripId,
        conversationId,
        eventId: eventRef.id,
        category,
        summary,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'tripChatHook',
      });
    } catch (error) {
      console.error('[tripChatHook] Error registrando evento', { tripId, conversationId }, error);
    }
  });

async function summarizeMessage(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.CHATBOT_SUMMARY_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'Resume el mensaje del chofer en no más de 200 caracteres, resalta ubicaciones generales pero no incluyas datos sensibles.',
            },
            { role: 'user', content: trimmed },
          ],
        }),
      });
      if (response.ok) {
        const json = (await response.json()) as any;
        const value = json?.choices?.[0]?.message?.content?.toString().trim();
        if (value) return value;
      } else {
        console.warn('[tripChatHook] OpenAI summarize fallo', response.status, await safeRead(response));
      }
    } catch (error) {
      console.error('[tripChatHook] Error en resumen OpenAI', error);
    }
  }

  return trimmed.length <= 200 ? trimmed : `${trimmed.slice(0, 197)}...`;
}

async function categorizeMessage(text: string): Promise<ClassificationLabel> {
  const normalized = text.toLowerCase();
  for (const rule of HEURISTIC_RULES) {
    if (rule.patterns.some((regex) => regex.test(normalized))) {
      return rule.label;
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.CHATBOT_CLASSIFIER_MODEL || 'gpt-4o-mini',
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'Clasifica el mensaje del chofer en una de las categorías: status_update, technical_issue, delay, accident, emergency. Responde solo con la etiqueta.',
            },
            { role: 'user', content: text },
          ],
        }),
      });
      if (response.ok) {
        const json = (await response.json()) as any;
        const label = json?.choices?.[0]?.message?.content?.toString().trim().toLowerCase();
        if (
          label === 'status_update' ||
          label === 'technical_issue' ||
          label === 'delay' ||
          label === 'accident' ||
          label === 'emergency'
        ) {
          return label;
        }
      } else {
        console.warn('[tripChatHook] OpenAI categorize fallo', response.status, await safeRead(response));
      }
    } catch (error) {
      console.error('[tripChatHook] Error en clasificación OpenAI', error);
    }
  }

  return CLASSIFICATION_FALLBACK;
}

async function safeRead(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '[no-body]';
  }
}
