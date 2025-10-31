import React, { useState } from 'react';
import { Load, LoadStatus, PaymentDetails, PlaceLocation, User } from '../types';
import PlaceAutocomplete from './PlaceAutocomplete';

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
  const aa = s1 * s1 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
};

const PostLoadPagePlaces: React.FC<{ user: User; onAddLoad: (load: Omit<Load, 'id' | 'createdAt'>) => void; onBack: () => void; }> = ({ user, onAddLoad, onBack }) => {
  const [title, setTitle] = useState('');
  const [startLocation, setStartLocation] = useState<PlaceLocation | null>(null);
  const [endLocation, setEndLocation] = useState<PlaceLocation | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [price, setPrice] = useState<number | ''>('');
  const [currency, setCurrency] = useState<'ARS' | 'USD' | 'BRL'>('ARS');
  const [cargoDetails, setCargoDetails] = useState('');
  const [error, setError] = useState('');

  const paymentDetails: PaymentDetails = { method: 'transferencia', terms: 'Transferencia bancaria', methods: ['transferencia'] };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('El título es obligatorio.'); return; }
    if (!startLocation || !endLocation) { setError('Selecciona origen y destino válidos.'); return; }
    if (!price) { setError('Debes especificar un precio.'); return; }

    const newLoad: Omit<Load, 'id' | 'createdAt'> = {
      companyId: user.id,
      driverId: null,
      status: LoadStatus.AVAILABLE,
      startLocation,
      endLocation,
      price: Number(price),
      currency,
      title: title.trim(),
      distanceKm: distanceKm || undefined,
      company: user.companyName || 'Empresa',
      cargoDetails,
      requirements: [],
      requiredTruckType: [],
      paymentDetails,
      billing: { type: 'remito' },
    };
    onAddLoad(newLoad);
  };

  return (
    <div className="max-w-2xl mx-auto p-8 bg-gray-800 rounded-lg shadow-lg mt-8">
      <button onClick={onBack} className="text-blue-400 hover:underline mb-6">&larr; Volver</button>
      <h2 className="text-2xl font-bold mb-6">Publicar Nueva Carga</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-400 mb-2">Título de la Carga</label>
          <input id="title" type="text" value={title} onChange={e=>setTitle(e.target.value)} required className="w-full p-3 bg-gray-700 rounded-md" placeholder="Ejemplo: Carga de madera a Rosario" />
        </div>

        <div>
          <PlaceAutocomplete
            label="Dirección de Origen"
            onSelect={(p) => {
              setStartLocation(p);
              setError('');
              if (p && endLocation) setDistanceKm(haversineKm({ lat: p.lat, lng: p.lng }, { lat: endLocation.lat, lng: endLocation.lng }));
            }}
          />
        </div>

        <div>
          <PlaceAutocomplete
            label="Dirección de Destino"
            onSelect={(p) => {
              setEndLocation(p);
              setError('');
              if (p && startLocation) setDistanceKm(haversineKm({ lat: startLocation.lat, lng: startLocation.lng }, { lat: p.lat, lng: p.lng }));
            }}
          />
        </div>

        {distanceKm != null && (
          <div className="text-sm text-blue-300"><i className="fas fa-route mr-2"></i>Distancia estimada: {Math.round(distanceKm)} km</div>
        )}

        <div>
          <label htmlFor="price" className="block text-sm font-medium text-gray-400 mb-2">Precio Ofrecido</label>
          <div className="flex gap-2">
            <select value={currency} onChange={e=>setCurrency(e.target.value as any)} className="p-3 bg-gray-700 rounded-md">
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
            </select>
            <input id="price" type="number" placeholder="Ej: 2000000" value={price} onChange={e => setPrice(e.target.value === '' ? '' : Number(e.target.value))} required className="flex-1 p-3 bg-gray-700 rounded-md" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">Detalles de la Carga</label>
          <textarea value={cargoDetails} onChange={e=>setCargoDetails(e.target.value)} className="w-full p-3 bg-gray-700 rounded-md" rows={3} placeholder="Ej: pallets, frágil, peso aprox." />
        </div>

        {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-center">{error}</p>}

        <button type="submit" className="w-full bg-[#F57921] text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-all">Publicar Carga</button>
      </form>
    </div>
  );
};

export default PostLoadPagePlaces;

