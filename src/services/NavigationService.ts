import { Plan } from '../types';

type LatLngInput = google.maps.LatLngLiteral | google.maps.LatLng;

interface RouteOptions {
  origin: LatLngInput;
  destination: LatLngInput;
  waypoints?: google.maps.DirectionsWaypoint[];
  plan: Plan;
  notify?: (message: string) => void;
  speak?: (text: string, force?: boolean) => void;
}

export interface NavigationEventHandlers {
  onDelayDetected?: (minutes: number) => void;
  onAlternatives?: (routes: google.maps.DirectionsRoute[]) => void;
  onRouteApplied?: (routeIndex: number, result: google.maps.DirectionsResult) => void;
  onRecalculation?: (reason: 'delay' | 'deviation') => void;
  onError?: (message: string, error?: unknown) => void;
}

const WARNING_TEXT = 'Aviso: la ruta puede no ser apta para transito pesado o dimensiones del vehiculo.';
const DELAY_THRESHOLD_SECONDS = 120;
const DEVIATION_THRESHOLD_METERS = 200;
const EARTH_RADIUS_M = 6371000;

export class NavigationService {
  private readonly directionsService = new google.maps.DirectionsService();
  private readonly directionsRenderer: google.maps.DirectionsRenderer;
  private readonly trafficLayer: google.maps.TrafficLayer;
  private readonly handlers: NavigationEventHandlers;

  private notify: (message: string) => void;
  private speak: (text: string, force?: boolean) => void;

  private geolocationWatchId: number | null = null;
  private activePath: google.maps.LatLngLiteral[] = [];
  private currentResult: google.maps.DirectionsResult | null = null;
  private currentPlan: Plan = 'free';
  private isRouting = false;
  private isSilverOrBetter = false;

  constructor(map: google.maps.Map, handlers: NavigationEventHandlers = {}) {
    this.handlers = handlers;
    this.directionsRenderer = new google.maps.DirectionsRenderer({
      suppressMarkers: false,
      preserveViewport: false,
    });
    this.directionsRenderer.setMap(map);

    this.trafficLayer = new google.maps.TrafficLayer();
    this.trafficLayer.setMap(map);

    this.notify = this.defaultNotify;
    this.speak = this.defaultSpeak;
  }

  async start(options: RouteOptions, handlers: NavigationEventHandlers = {}) {
    Object.assign(this.handlers, handlers);
    this.currentPlan = options.plan;
    this.isSilverOrBetter = options.plan === 'silver' || options.plan === 'gold';

    this.notify = options.notify || this.defaultNotify;
    this.speak = options.speak || this.defaultSpeak;

    this.announceWarning();
    await this.calculateRoute(options, 'initial');
    this.startDeviationWatcher();
  }

  async recalculate(reason: 'refresh' | 'deviation' | 'delay') {
    if (!this.currentResult) return;
    const request = this.directionsRenderer.getDirections()?.request;
    if (!request) return;

    this.announceWarning();
    await this.calculateRoute(
      {
        origin: request.origin as LatLngInput,
        destination: request.destination as LatLngInput,
        waypoints: request.waypoints || undefined,
        plan: this.currentPlan,
      },
      reason,
    );
  }

  selectAlternative(routeIndex: number) {
    if (!this.currentResult) return;
    if (routeIndex < 0 || routeIndex >= this.currentResult.routes.length) return;
    this.directionsRenderer.setDirections(this.currentResult);
    this.directionsRenderer.setRouteIndex(routeIndex);
    const route = this.currentResult.routes[routeIndex];
    this.activePath = extractPath(route);
    this.checkTraffic(route, 'refresh');
    this.handlers.onRouteApplied?.(routeIndex, this.currentResult);
  }

  dispose() {
    if (this.geolocationWatchId !== null) {
      navigator.geolocation.clearWatch(this.geolocationWatchId);
      this.geolocationWatchId = null;
    }
    this.directionsRenderer.setMap(null);
    this.trafficLayer.setMap(null);
  }

  private async calculateRoute(options: RouteOptions, reason: 'initial' | 'refresh' | 'deviation' | 'delay') {
    if (this.isRouting) return;
    this.isRouting = true;
    try {
      const origin = toLatLngLiteral(options.origin);
      const destination = toLatLngLiteral(options.destination);

      const provideAlternatives = this.isSilverOrBetter;

      const result = await this.directionsService.route({
        origin,
        destination,
        waypoints: options.waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        drivingOptions: { departureTime: new Date() },
        provideRouteAlternatives,
      });

      this.currentResult = result;
      this.directionsRenderer.setDirections(result);
      this.directionsRenderer.setRouteIndex(0);

      const primaryRoute = result.routes[0];
      if (primaryRoute) {
        this.activePath = extractPath(primaryRoute);
        this.checkTraffic(primaryRoute, reason);
      } else {
        this.handlers.onDelayDetected?.(0);
      }

      if (provideAlternatives && result.routes.length > 1) {
        this.handlers.onAlternatives?.(result.routes);
      }

      this.handlers.onRouteApplied?.(0, result);
    } catch (error) {
      const message =
        (error as any)?.message || 'No fue posible calcular la ruta en este momento. Intenta nuevamente.';
      this.handlers.onError?.(message, error);
      this.notify(message);
    } finally {
      this.isRouting = false;
    }
  }

  private checkTraffic(route: google.maps.DirectionsRoute, reason: 'initial' | 'refresh' | 'deviation' | 'delay') {
    const leg = route.legs?.[0];
    if (!leg) {
      this.handlers.onDelayDetected?.(0);
      return;
    }

    const baseSeconds = leg.duration?.value ?? 0;
    const trafficSeconds = (leg as any).duration_in_traffic?.value ?? baseSeconds;
    const delaySeconds = Math.max(0, trafficSeconds - baseSeconds);

    if (delaySeconds > DELAY_THRESHOLD_SECONDS) {
      const minutes = Math.round(delaySeconds / 60);
      const message = `Demora estimada de ${minutes} minutos.`;
      this.notify(message);
      this.speak(`Atencion. Demora estimada de ${minutes} minutos.`);
      this.handlers.onDelayDetected?.(minutes);
      if (reason !== 'delay') {
        this.handlers.onRecalculation?.('delay');
      }
    } else {
      this.handlers.onDelayDetected?.(0);
    }
  }

  private startDeviationWatcher() {
    if (!navigator.geolocation) {
      this.handlers.onError?.('Geolocalizacion no soportada por el dispositivo');
      return;
    }
    if (this.geolocationWatchId !== null) {
      navigator.geolocation.clearWatch(this.geolocationWatchId);
      this.geolocationWatchId = null;
    }

    this.geolocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!this.activePath.length) return;
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        const distance = distanceToPathMeters(point, this.activePath);
        if (distance > DEVIATION_THRESHOLD_METERS) {
          this.handlers.onRecalculation?.('deviation');
          this.recalculate('deviation').catch((error) => {
            console.error('[NavigationService] error al recalcular', error);
          });
        }
      },
      (error) => {
        this.handlers.onError?.('No fue posible obtener la ubicacion actual', error);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
  }

  private announceWarning() {
    this.notify(WARNING_TEXT);
    this.speak(WARNING_TEXT, true);
  }

  private defaultNotify(message: string) {
    if (typeof window === 'undefined') {
      console.info('[Navigation] Notice:', message);
      return;
    }
    window.dispatchEvent(
      new CustomEvent('navigation:notice', {
        detail: {
          message,
          ts: Date.now(),
        },
      }),
    );
  }

  private defaultSpeak(text: string, force = false) {
    if (typeof window === 'undefined') return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const utterance = new SpeechSynthesisUtterance(text);
      if (!force) {
        const speaking = synth.speaking || synth.pending;
        if (speaking) return;
      }
      synth.speak(utterance);
    } catch (error) {
      console.warn('[NavigationService] speech synthesis unavailable', error);
    }
  }
}

function toLatLngLiteral(value: LatLngInput): google.maps.LatLngLiteral {
  if (typeof (value as google.maps.LatLngLiteral).lat === 'number') {
    return value as google.maps.LatLngLiteral;
  }
  const latLng = value as google.maps.LatLng;
  return { lat: latLng.lat(), lng: latLng.lng() };
}

function extractPath(route: google.maps.DirectionsRoute): google.maps.LatLngLiteral[] {
  if (!route.overview_path) return [];
  return route.overview_path
    .map((point) => {
      if (typeof point.lat === 'function' && typeof point.lng === 'function') {
        return { lat: point.lat(), lng: point.lng() };
      }
      if (typeof point.lat === 'number' && typeof point.lng === 'number') {
        return { lat: point.lat, lng: point.lng };
      }
      return null;
    })
    .filter(Boolean) as google.maps.LatLngLiteral[];
}

function distanceToPathMeters(point: google.maps.LatLngLiteral, path: google.maps.LatLngLiteral[]) {
  if (!path.length) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length - 1; i += 1) {
    const dist = distanceToSegmentMeters(point, path[i], path[i + 1]);
    if (dist < min) min = dist;
  }
  return min;
}

function distanceToSegmentMeters(
  p: google.maps.LatLngLiteral,
  a: google.maps.LatLngLiteral,
  b: google.maps.LatLngLiteral,
) {
  const toRad = Math.PI / 180;
  const ax = a.lng * toRad * Math.cos(a.lat * toRad);
  const ay = a.lat * toRad;
  const bx = b.lng * toRad * Math.cos(b.lat * toRad);
  const by = b.lat * toRad;
  const px = p.lng * toRad * Math.cos(p.lat * toRad);
  const py = p.lat * toRad;

  const abx = bx - ax;
  const aby = by - ay;
  const abNormSq = abx * abx + aby * aby;
  if (abNormSq === 0) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.sqrt(dx * dx + dy * dy) * EARTH_RADIUS_M;
  }

  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abNormSq));
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  const dx = px - closestX;
  const dy = py - closestY;
  return Math.sqrt(dx * dx + dy * dy) * EARTH_RADIUS_M;
}
