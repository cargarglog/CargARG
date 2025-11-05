import React, { useState } from 'react';
import type { Plan } from '../../types';
import { getProvider } from '../provider';
import { auth } from '../../firebase';
import { setInitialFreePlanIfMissing } from '../firestore';

type Props = { className?: string };

const plans: Array<{ key: Plan; title: string; price: string; features: string[] }> = [
  { key: 'free', title: 'Free', price: '$0', features: ['Básico'] },
  { key: 'silver', title: 'Silver', price: '$', features: ['Publicar cargas', '2 cupos simultáneos'] },
  { key: 'gold', title: 'Gold', price: '$$', features: ['Publicar cargas', 'Cupos ilimitados', 'Prioridad'] },
];

export const SubscriptionPlans: React.FC<Props> = ({ className }) => {
  const [busy, setBusy] = useState<string | null>(null);

  async function onSelect(plan: Plan) {
    const user = auth.currentUser; if (!user) { alert('Inicie sesión'); return; }
    setBusy(plan);
    try {
      await setInitialFreePlanIfMissing(user.uid);
      const provider = await getProvider();
      const res = await provider.startPurchase(plan);
      if (!res.ok && res.message) alert(res.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={className || ''}>
      <h2>Planes de suscripción</h2>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {plans.map(p => (
          <div key={p.key} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
            <h3>{p.title}</h3>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{p.price}</div>
            <ul>
              {p.features.map(f => <li key={f}>{f}</li>)}
            </ul>
            <button disabled={!!busy} onClick={() => onSelect(p.key)}>
              {busy === p.key ? 'Procesando...' : (p.key === 'free' ? 'Activar' : 'Suscribirme')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubscriptionPlans;

