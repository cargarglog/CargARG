import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { Plan } from '../types';
import { functions } from '../firebase';
import { NavigationService, NavigationEventHandlers } from '../services/NavigationService';

type LatLngLiteral = { lat: number; lng: number };

type DirectionsWaypoint = { location: LatLngLiteral | string; stopover?: boolean };

interface DriverDashboardMapProps {
  plan: Plan;
  origin: LatLngLiteral;
  destination: LatLngLiteral;
  waypoints?: DirectionsWaypoint[];
  conversationId: string;
  tripId: string;
}

type ChatEntry = {
  id: string;
  sender: 'driver' | 'bot';
  text: string;
};

type ChatbotPayload = {
  ok: boolean;
  reply?: string;
  domainBlocked?: boolean;
};

const WARNING_TEXT = 'Aviso: la ruta puede no ser apta para transito pesado o dimensiones del vehiculo.';
const MAPS_API_KEY = (import.meta.env as any)?.VITE_GOOGLE_MAPS_API_KEY || '';
const MAPS_LIBRARIES: string[] = ((import.meta.env as any)?.VITE_GOOGLE_MAPS_LIBRARIES || 'geometry')
  .split(',')
  .map((lib: string) => lib.trim())
  .filter(Boolean);

declare global {
  interface Window {
    google?: any;
    __cargARGMapsPromise?: Promise<any>;
  }
}

function loadGoogleMapsSdk(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Entorno sin ventana'));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (window.__cargARGMapsPromise) {
    return window.__cargARGMapsPromise;
  }
  if (!MAPS_API_KEY) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY no configurada'));
  }
  window.__cargARGMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: MAPS_API_KEY,
      libraries: MAPS_LIBRARIES.join(','),
      language: 'es',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps no disponible tras cargar el script'));
      }
    };
    script.onerror = () => reject(new Error('No fue posible cargar Google Maps.'));
    document.head.appendChild(script);
  }).catch((error) => {
    delete window.__cargARGMapsPromise;
    throw error;
  });
  return window.__cargARGMapsPromise;
}

const isTripRelatedQuestion = (text: string) =>
  /(carga|viaje|destino|origen|entrega|retiro|eta|arribo|camion|logistica|ruta)/i.test(text);

export default function DriverDashboardMap({
  plan,
  origin,
  destination,
  waypoints,
  conversationId,
  tripId,
}: DriverDashboardMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const navigationServiceRef = useRef<NavigationService | null>(null);
  const mapRef = useRef<any>(null);
  const lastSpokenRef = useRef<string>('');
  const lastDelayMinutesRef = useRef<number | null>(null);

  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [delayMinutes, setDelayMinutes] = useState<number | null>(null);
  const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Soy tu asistente de carga. Solo comparto informacion confirmada por logistica.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [ttsMuted, setTtsMuted] = useState(false);
  const ttsMutedRef = useRef(ttsMuted);

  useEffect(() => {
    ttsMutedRef.current = ttsMuted;
    if (ttsMuted && typeof window !== 'undefined') {
      try {
        window.speechSynthesis?.cancel();
      } catch (error) {
        console.warn('[DriverDashboardMap] speech cancellation failed', error);
      }
    }
  }, [ttsMuted]);

  const provideAlternatives = useMemo(() => plan === 'silver' || plan === 'gold', [plan]);

  const navigationWaypoints = useMemo(() => {
    if (!waypoints?.length) return undefined;
    return waypoints.map((wp) => ({
      location: wp.location,
      stopover: wp.stopover ?? false,
    }));
  }, [waypoints]);

  const speak = useCallback(
    (text: string, force = false) => {
      if (ttsMutedRef.current) return;
      if (typeof window === 'undefined') return;
      try {
        const synth = window.speechSynthesis;
        if (!synth) return;
        if (!force && lastSpokenRef.current === text) return;
        lastSpokenRef.current = text;
        const utter = new SpeechSynthesisUtterance(text);
        synth.speak(utter);
      } catch (error) {
        console.warn('[DriverDashboardMap] speech synthesis unavailable', error);
      }
    },
    [],
  );

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;
    loadGoogleMapsSdk()
      .then(() => {
        if (!cancelled) setMapsLoaded(true);
      })
      .catch((error) => {
        console.error('[DriverDashboardMap] loadGoogleMapsSdk error', error);
        if (!cancelled) setMapError(error.message || 'Google Maps no disponible.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || !mapsLoaded) return;
    const googleMaps = (window as any)?.google?.maps;
    if (!googleMaps) {
      setMapError('Google Maps no esta disponible. Verifica la carga del script.');
      return;
    }

    if (!mapRef.current) {
      mapRef.current = new googleMaps.Map(mapContainerRef.current, {
        zoom: 7,
        center: origin,
        mapTypeControl: false,
        streetViewControl: false,
      });
    } else {
      mapRef.current.setCenter(origin);
    }

    const notify = (message: string) => {
      setStatusMessage(message);
    };

    const speakWrapper = (text: string, force = false) => {
      const shouldForce = force || text === WARNING_TEXT;
      speak(text, shouldForce);
    };

    const handlers: NavigationEventHandlers = {
      onRouteApplied: (routeIndex, result) => {
        setDirectionsResult(result);
        setSelectedRouteIndex(routeIndex);
        setDelayMinutes(null);
        lastDelayMinutesRef.current = null;
      },
      onAlternatives: () => {
        // handled via state derived from directionsResult
      },
      onDelayDetected: (minutes) => {
        if (minutes > 0) {
          setDelayMinutes(minutes);
          lastDelayMinutesRef.current = minutes;
        } else {
          setDelayMinutes(null);
          lastDelayMinutesRef.current = null;
        }
      },
      onRecalculation: (reason) => {
        if (reason === 'deviation') {
          const text = 'Ruta recalculada por desviacion detectada.';
          setStatusMessage(text);
          speak(text, true);
        } else if (reason === 'delay') {
          setStatusMessage('Actualizando ruta debido a demoras detectadas.');
        }
      },
      onError: (message, error) => {
        console.error('[DriverDashboardMap] navigation error', error);
        setStatusMessage(message);
      },
    };

    navigationServiceRef.current?.dispose();
    if (!mapRef.current) return;

    const service = new NavigationService(mapRef.current, handlers);
    navigationServiceRef.current = service;

    service
      .start(
        {
          origin,
          destination,
          waypoints: navigationWaypoints,
          plan,
          notify,
          speak: speakWrapper,
        },
        handlers,
      )
      .catch((error) => {
        console.error('[DriverDashboardMap] navigation start error', error);
        setStatusMessage(
          (error as any)?.message || 'No fue posible iniciar la navegacion. Intenta nuevamente.',
        );
      });

    return () => {
      service.dispose();
      if (navigationServiceRef.current === service) {
        navigationServiceRef.current = null;
      }
    };
  }, [
    mapsLoaded,
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
    plan,
    speak,
    navigationWaypoints,
  ]);

  const handleSelectAlternative = useCallback(
    (index: number) => {
      if (!directionsResult) return;
      setSelectedRouteIndex(index);
      navigationServiceRef.current?.selectAlternative(index);
      setStatusMessage(`Alternativa ${index + 1} aplicada.`);
    },
    [directionsResult],
  );

  const appendChatMessage = useCallback((entry: ChatEntry) => {
    setChatMessages((prev) => [...prev, entry]);
  }, []);

  useEffect(() => {
    if (!statusMessage || statusMessage === WARNING_TEXT) return;
    const timeout = window.setTimeout(() => setStatusMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  const handleChatSubmit = useCallback(async () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    setChatInput('');
    appendChatMessage({
      id: `driver-${Date.now()}`,
      sender: 'driver',
      text: trimmed,
    });

    if (!isTripRelatedQuestion(trimmed)) {
      const response = 'Solo puedo responder sobre esta carga.';
      appendChatMessage({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: response,
      });
      speak(response);
      return;
    }

    setChatLoading(true);
    try {
      const callable = httpsCallable(functions, 'chatbotFunction');
      const payload = await callable({
        conversationId,
        tripId,
        role: 'driver',
        message: trimmed,
        meta: {
          tripChatActive: true,
          ttsMuted,
        },
      });
      const data = (payload?.data || {}) as ChatbotPayload;
      const text = data.reply?.trim() || 'Esa informacion aun no fue confirmada por logistica.';
      appendChatMessage({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text,
      });
      speak(text);
    } catch (error) {
      console.error('[DriverDashboardMap] chatbot error', error);
      const fallback = 'No pude contactar al asistente. Intenta nuevamente en unos instantes.';
      appendChatMessage({
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: fallback,
      });
    } finally {
      setChatLoading(false);
    }
  }, [appendChatMessage, chatInput, conversationId, speak, tripId, ttsMuted]);

  if (mapError) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-red-600">
        {mapError}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[480px] bg-gray-100 rounded-lg overflow-hidden shadow-inner">
      <div ref={mapContainerRef} className="w-full h-full" />

      {statusMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 text-gray-900 text-sm px-4 py-2 rounded-full shadow">
          {statusMessage}
        </div>
      )}

      {delayMinutes !== null && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-amber-200 text-amber-900 text-sm font-medium px-4 py-2 rounded-full shadow">
          Demora estimada: {delayMinutes} min.
        </div>
      )}

      {provideAlternatives && directionsResult?.routes?.length > 1 && (
        <div className="absolute bottom-24 left-4 bg-white/95 rounded-md shadow-lg p-3 space-y-2 w-64">
          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Rutas alternativas
          </div>
          <div className="flex flex-col gap-2">
            {directionsResult.routes.map((route: any, idx: number) => {
              const summary = route.summary || `Opcion ${idx + 1}`;
              const leg = route.legs?.[0];
              const duration = leg?.duration?.text || '';
              const distance = leg?.distance?.text || '';
              const isActive = selectedRouteIndex === idx;
              return (
                <button
                  key={summary + idx}
                  type="button"
                  onClick={() => handleSelectAlternative(idx)}
                  className={`text-left rounded border px-3 py-2 text-sm ${
                    isActive ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="font-semibold">{summary}</div>
                  <div className="text-xs text-gray-500 flex gap-2">
                    {duration && <span>{duration}</span>}
                    {distance && <span>{distance}</span>}
                  </div>
                  {idx === 0 && <div className="text-[10px] text-gray-400 mt-1">Ruta recomendada</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 w-80 max-w-full bg-white/95 rounded-lg shadow-xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Asistente previo a aceptar carga</h3>
              <p className="text-xs text-gray-500 mt-1">
                Formula tus dudas sobre la carga con datos ya confirmados.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTtsMuted((prev) => !prev)}
              className={`text-xs font-semibold px-3 py-1 rounded-md border ${
                ttsMuted
                  ? 'border-gray-300 text-gray-500 bg-gray-100 hover:bg-gray-200'
                  : 'border-blue-500 text-blue-600 bg-blue-50 hover:bg-blue-100'
              }`}
            >
              {ttsMuted ? 'Activar voz' : 'Mutear voz'}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-h-60">
          {chatMessages.map((entry) => (
            <div
              key={entry.id}
              className={`text-sm leading-tight ${
                entry.sender === 'driver' ? 'text-gray-800' : 'text-blue-700'
              }`}
            >
              <span className="block text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">
                {entry.sender === 'driver' ? 'Tu' : 'Asistente'}
              </span>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <input
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Escribe tu pregunta..."
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleChatSubmit();
                }
              }}
              disabled={chatLoading}
            />
            <button
              type="button"
              onClick={handleChatSubmit}
              disabled={chatLoading || !chatInput.trim()}
              className="px-3 py-2 text-sm font-semibold rounded-md bg-blue-600 text-white disabled:bg-gray-300"
            >
              {chatLoading ? '...' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
