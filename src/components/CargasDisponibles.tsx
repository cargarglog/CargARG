import React, { useState } from 'react';

// Inline icon components (lucide-like) to avoid external deps
const IconUser: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconLock: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconChevronDown: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconLoader: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
  </svg>
);

const IconPackageSearch: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M21 16.5V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8.5a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l3.5-2" />
    <path d="M7.5 4.21 12 6.81l4.5-2.6" />
    <path d="M12 12.5v9.5" />
    <circle cx="19" cy="19" r="3" />
    <path d="m21.5 21.5-1-1" />
  </svg>
);

const IconTruck: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M10 17h4V5H2v12h2" />
    <path d="M14 7h3l5 5v5h-2" />
    <circle cx="7.5" cy="17.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);

const CargasDisponibles: React.FC = () => {
  const [orderOpen, setOrderOpen] = useState(false);

  return (
    <div className="min-h-screen text-gray-100 bg-gradient-to-b from-[#7F1D1D] via-[#111827] to-[#0B1220]">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/30 backdrop-blur supports-[backdrop-filter]:bg-black/30">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="text-xl font-extrabold tracking-tight text-white select-none">
            <span className="text-white">Carg</span>
            <span className="text-[#DC2626]">ARG</span>
          </div>

          <button
            className="size-10 rounded-full border border-white/10 bg-black/20 hover:bg-black/30 text-gray-200 flex items-center justify-center"
            aria-label="Perfil"
          >
            <IconUser className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="pt-20 pb-24 sm:pb-28">
        <div className="mx-auto max-w-5xl px-4 space-y-6">
          {/* Info Card */}
          <section className="bg-[#111827] border border-white/10 text-gray-100 shadow-lg rounded-2xl">
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-white text-base sm:text-lg font-semibold">Plan FREE Activado: Radio de 150 km</h3>
                  <p className="text-gray-300 text-sm mt-1">
                    Estás viendo cargas dentro de tu radio de búsqueda. Para desbloquear filtros avanzados y un radio mayor, considera mejorar tu plan.
                  </p>
                </div>
                <button
                  className="whitespace-nowrap bg-[#B91C1C] hover:bg-[#DC2626] text-white px-4 py-2 rounded-2xl shadow transition-colors"
                >
                  Actualizar Plan
                </button>
              </div>
            </div>
          </section>

          {/* Filtros */}
          <section className="bg-[#111827] border border-white/10 text-gray-100 shadow-lg rounded-2xl">
            <div className="p-5 sm:p-6">
              <h4 className="text-white text-base sm:text-lg font-semibold">Filtrar Cargas</h4>
              <p className="text-gray-300 text-sm mt-1">Filtros avanzados disponibles al mejorar tu plan.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {/* Tipo de Camión (disabled) */}
                <div className="relative">
                  <label className="block mb-1 text-sm text-gray-400">Tipo de Camión</label>
                  <select disabled className="w-full bg-[#0F172A] text-gray-200 border border-white/10 rounded-xl pr-10 py-2 px-3 appearance-none">
                    <option>Bloqueado en Plan FREE</option>
                  </select>
                  <IconLock className="absolute right-3 top-[38px] h-4 w-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Rango de Precio (disabled) */}
                <div className="relative">
                  <label className="block mb-1 text-sm text-gray-400">Rango de Precio</label>
                  <select disabled className="w-full bg-[#0F172A] text-gray-200 border border-white/10 rounded-xl pr-10 py-2 px-3 appearance-none">
                    <option>Bloqueado en Plan FREE</option>
                  </select>
                  <IconLock className="absolute right-3 top-[38px] h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </section>

          {/* Cargas Disponibles + Orden */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-semibold text-white">Cargas Disponibles</h2>

            <div className="relative">
              <button
                onClick={() => setOrderOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={orderOpen}
                className="text-gray-200 bg-black/20 hover:bg-black/30 border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2"
              >
                <span>Ordenar por: Recomendado</span>
                <IconChevronDown className={`h-4 w-4 transition-transform ${orderOpen ? 'rotate-180' : ''}`} />
              </button>
              {orderOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 min-w-56 bg-[#111827] text-gray-100 border border-white/10 rounded-xl shadow-lg overflow-hidden"
                >
                  {['Recomendado', 'Más Cercanas', 'Mejor Paga', 'Más Recientes'].map((opt) => (
                    <button
                      key={opt}
                      role="menuitem"
                      onClick={() => setOrderOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-black/30"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Placeholder resultados */}
          <div className="rounded-2xl border border-white/10 bg-[#0B1220] p-10 text-center shadow-lg">
            <div className="flex flex-col items-center gap-3">
              <IconLoader className="h-6 w-6 animate-spin text-gray-300" />
              <p className="text-gray-300">Buscando cargas cercanas…</p>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/40 backdrop-blur supports-[backdrop-filter]:bg-black/40">
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid grid-cols-2">
            {/* Disponibles (activo) */}
            <button
              className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-white bg-[#111827]/60"
              aria-current="page"
            >
              <IconPackageSearch className="h-5 w-5 text-[#DC2626]" />
              <span className="text-[#DC2626]">Disponibles</span>
            </button>

            {/* Mis Cargas (inactivo) */}
            <button className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-gray-300 hover:text-white">
              <IconTruck className="h-5 w-5 text-gray-400" />
              <span className="text-gray-300">Mis Cargas</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default CargasDisponibles;

