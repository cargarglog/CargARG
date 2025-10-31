import React, { useEffect, useMemo, useRef, useState } from 'react';
import { autocompletePlaces, getPlaceDetails, PlaceSuggestion } from '../services/places';
import { PlaceLocation } from '../types';

type Props = {
  label: string;
  placeholder?: string;
  onSelect: (place: PlaceLocation) => void;
  initialText?: string;
};

function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

function newSessionToken() {
  try { // @ts-ignore
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return Math.random().toString(36).slice(2);
}

export default function PlaceAutocomplete({ label, placeholder, onSelect, initialText }: Props) {
  const [query, setQuery] = useState(initialText || '');
  const debounced = useDebounced(query, 250);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionRef = useRef<string>(newSessionToken());

  useEffect(() => {
    let alive = true;
    if (!debounced || debounced.length < 3) { setItems([]); setOpen(false); return; }
    setLoading(true);
    autocompletePlaces(debounced, sessionRef.current)
      .then(list => { if (!alive) return; setItems(list); setOpen(true); })
      .catch(() => { if (!alive) return; setItems([]); setOpen(false); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [debounced]);

  const handlePick = async (opt: PlaceSuggestion) => {
    try {
      setOpen(false);
      const d = await getPlaceDetails(opt.id, sessionRef.current);
      onSelect({ address: d.address || opt.address || opt.label, lat: d.lat, lng: d.lng, placeId: d.id });
      setQuery(d.address || opt.address || opt.label);
      sessionRef.current = newSessionToken();
    } catch {
      // swallow
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <label className="block text-sm font-medium text-gray-400 mb-2">{label}</label>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'Buscar dirección, ciudad...'}
        className="w-full p-3 bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F57921]"
      />
      {open && items.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-10 bg-white text-gray-900 rounded-md shadow border border-gray-200 mt-1 max-h-64 overflow-y-auto w-full"
        >
          {items.map(opt => (
            <li key={opt.id}
                role="option"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handlePick(opt)}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                title={opt.address}>
              {opt.label || opt.address}
            </li>
          ))}
        </ul>
      )}
      {loading && <div className="text-xs text-gray-400 mt-1">Buscando...</div>}
    </div>
  );
}

