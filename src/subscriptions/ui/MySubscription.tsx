import React, { useEffect, useMemo, useState } from 'react';
import * as firestore from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { getProvider } from '../provider';
import type { SubscriptionRecord } from '../types';

export const MySubscription: React.FC<{ className?: string }> = ({ className }) => {
  const [sub, setSub] = useState<SubscriptionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const user = auth.currentUser;
  const userRef = useMemo(() => user ? firestore.doc(db, 'users', user.uid) : null, [user?.uid]);

  useEffect(() => {
    if (!userRef) { setLoading(false); return; }
    const unsub = firestore.onSnapshot(userRef, (snap) => {
      const data = snap.data() as any;
      setSub(data?.subscription || null);
      setLoading(false);
    });
    return () => unsub();
  }, [userRef]);

  async function changeCard() {
    const provider = await getProvider();
    if (!provider.supportsChangePayment) {
      alert('Gestione su método de pago en la tienda');
      await provider.openBillingPortal();
      return;
    }
    await provider.openBillingPortal();
  }

  async function cancel() {
    const provider = await getProvider();
    const r = await provider.cancelSubscription();
    if (!r.ok && r.message) alert(r.message);
  }

  if (!auth.currentUser) return <div>Inicie sesión para ver su suscripción.</div>;
  if (loading) return <div>Cargando suscripción...</div>;

  return (
    <div className={className || ''}>
      <h2>Mi Suscripción</h2>
      {sub ? (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <div><strong>Plan:</strong> {sub.plan}</div>
          <div><strong>Estado:</strong> {sub.status}</div>
          {sub.renewalDate && <div><strong>Renovación:</strong> {sub.renewalDate}</div>}
          {sub.paymentMethod && <div><strong>Método de pago:</strong> {sub.paymentMethod}</div>}
          <div><strong>Proveedor:</strong> {sub.provider}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={changeCard}>Cambiar tarjeta</button>
            {sub.invoiceUrl && (
              <a href={sub.invoiceUrl} target="_blank" rel="noreferrer"><button>Ver facturación</button></a>
            )}
            <button onClick={cancel}>Cancelar suscripción</button>
          </div>
        </div>
      ) : (
        <div>No hay información de suscripción. Seleccione un plan.</div>
      )}
    </div>
  );
};

export default MySubscription;

