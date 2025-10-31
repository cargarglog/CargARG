const region = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1';
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const base = import.meta.env.VITE_FUNCTIONS_BASE_URL || (projectId ? `https://${region}-${projectId}.cloudfunctions.net` : '');

export type PlaceSuggestion = { id: string; label: string; address: string };
export type PlaceDetails = { id: string; name: string; address: string; lat: number; lng: number };

function ensureBase() {
  if (!base) throw new Error('Funciones de Firebase no configuradas (VITE_FIREBASE_PROJECT_ID ausente).');
}

export async function autocompletePlaces(q: string, session?: string, lang = 'es', regionCode = 'AR') {
  ensureBase();
  const params = new URLSearchParams({ q, lang, region: regionCode });
  if (session) params.set('session', session);
  const res = await fetch(`${base}/placesAutocomplete?${params.toString()}`);
  if (!res.ok) throw new Error('autocomplete_failed');
  const json = await res.json();
  return (json.items || []) as PlaceSuggestion[];
}

export async function getPlaceDetails(id: string, session?: string, lang = 'es', regionCode = 'AR') {
  ensureBase();
  const params = new URLSearchParams({ id, lang, region: regionCode });
  if (session) params.set('session', session);
  const res = await fetch(`${base}/placeDetails?${params.toString()}`);
  if (!res.ok) throw new Error('details_failed');
  return (await res.json()) as PlaceDetails;
}

