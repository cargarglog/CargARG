import React, { useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

export function showToast(message: string, type: ToastType = 'info', duration = 4000) {
  try {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { id: Date.now() + Math.random(), message, type, duration } }));
  } catch {
    // noop
  }
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: ToastType; expiresAt: number }>>([]);

  useEffect(() => {
    const handler = (e: any) => {
      const { id, message, type, duration } = e.detail || {};
      const expiresAt = Date.now() + (typeof duration === 'number' ? duration : 4000);
      setToasts((prev) => [...prev, { id, message, type: (type as ToastType) || 'info', expiresAt }]);
    };
    window.addEventListener('app:toast', handler as EventListener);
    const interval = window.setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => t.expiresAt > now));
    }, 300);
    return () => {
      window.removeEventListener('app:toast', handler as EventListener);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`max-w-xs shadow-lg rounded-md px-4 py-3 text-white ${
            t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-gray-800'
          }`}
        >
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
};

