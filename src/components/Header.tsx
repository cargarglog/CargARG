import React, { useState, useRef, useEffect } from 'react';
import { User, UserRole } from '../types';

interface NavbarProps {
  user: User | null;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  isOnline: boolean;
  onCancelSubscription?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onNavigate, onLogout, isOnline, onCancelSubscription }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const deferredPromptRef = useRef<any>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuRef]);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setCanInstall(true);
    };
    const handleInstalled = () => {
      setCanInstall(false);
      deferredPromptRef.current = null;
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    // Hide install if already running standalone
    const computeStandalone = () => {
      const m = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      const iosStandalone = (window as any).navigator?.standalone === true; // iOS Safari
      setIsStandalone(!!(m || iosStandalone));
    };
    computeStandalone();
    document.addEventListener('visibilitychange', computeStandalone);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
      document.removeEventListener('visibilitychange', computeStandalone);
    };
  }, []);

  const handleInstallClick = async () => {
    const dp = deferredPromptRef.current;
    if (dp) {
      dp.prompt();
      try {
        await dp.userChoice;
      } finally {
        setCanInstall(false);
        deferredPromptRef.current = null;
      }
    } else {
      // Fallback: mostrar ayuda para instalar manualmente
      setShowInstallHelp(true);
    }
  };

  return (
    <header className={`bg-charcoal-900 shadow-md sticky z-50 transition-all duration-300 ${isOnline ? 'top-0' : 'top-[40px]'}`}>
      <div className="max-w-7xl mx-auto p-4 flex justify-between items-center">
        <div className="cursor-pointer flex items-center gap-2" onClick={() => onNavigate(user ? 'dashboard' : 'landing')}>
          <img src="/assets/icons/icon-192.png" alt="CargARG" className="h-8 w-8 rounded-md" loading="lazy" decoding="async" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <span className="text-white">Carg</span><span className="text-brand-500">ARG</span>
          </h1>
        </div>
        <nav className="flex items-center gap-3">
          {!isStandalone && (
            <button
              onClick={handleInstallClick}
              className="bg-brand-600 text-white font-bold py-2 px-3 sm:px-4 rounded-md hover:bg-brand-500 transition-all flex items-center"
              aria-label="Instalar app"
              title="Instalar app"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M5 20h14a2 2 0 0 0 2-2v-2h-2v2H5v-2H3v2a2 2 0 0 0 2 2z"></path>
                <path d="M11 4v8.586L8.707 10.293 7.293 11.707 12 16.414l4.707-4.707-1.414-1.414L13 12.586V4h-2z"></path>
              </svg>
              <span className="hidden sm:inline ml-2">Instalar</span>
            </button>
          )}
          {user ? (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 bg-charcoal-800/50 hover:bg-charcoal-700/50 p-2 rounded-full transition-colors">
                <span className="font-semibold text-sm text-gray-200 hidden sm:inline">{user.email}</span>
                <i className="fas fa-user-circle text-2xl text-brand-400"></i>
                <i className={`fas fa-chevron-down text-xs text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}></i>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-700">
                  {user.role === UserRole.STAFF ? (
                    <a onClick={() => { onNavigate('staffDashboard'); setMenuOpen(false); }} className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">Panel de Staff</a>
                  ) : (
                    <a onClick={() => { onNavigate('dashboard'); setMenuOpen(false); }} className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">Dashboard</a>
                  )}
                  {user.role === UserRole.COMPANY && (
                    <a onClick={() => { onNavigate('postLoad'); setMenuOpen(false); }} className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">Publicar Carga</a>
                  )}
                   {user.role === UserRole.DRIVER && (
                    <a onClick={() => { onNavigate('dashboard'); setMenuOpen(false); }} className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">Mis Viajes</a>
                  )}
                  <a onClick={() => { onNavigate('plans'); setMenuOpen(false); }} className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">Planes</a>
                  {user.plan !== 'free' && (
                    <a onClick={() => { onCancelSubscription && onCancelSubscription(); setMenuOpen(false); }} className="block px-4 py-2 text-sm text-red-300 hover:bg-gray-700 cursor-pointer">Cancelar Suscripción</a>
                  )}
                  <div className="border-t border-gray-700 my-1"></div>
                  <a onClick={() => { onLogout(); setMenuOpen(false); }} className="block px-4 py-2 text-sm text-red-400 hover:bg-gray-700 cursor-pointer">Cerrar Sesión</a>
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={() => onNavigate('login')}
                className="bg-brand-600 text-white font-bold py-2 px-3 sm:px-6 rounded-md hover:bg-brand-500 transition-all duration-300 transform hover:scale-105 flex items-center"
                aria-label="Iniciar sesión"
                title="Iniciar sesión"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M10 17l5-5-5-5v3H3v4h7v3z"></path>
                  <path d="M20 3h-8v2h8v14h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"></path>
                </svg>
                <span className="hidden sm:inline ml-2">Iniciar Sesión</span>
              </button>
              <button
                onClick={() => onNavigate('login')}
                className="bg-gray-700 text-white font-semibold py-2 px-3 sm:px-4 rounded-md hover:bg-gray-600 transition-all"
                aria-label="Cancelar suscripción"
                title="Cancelar suscripción"
              >
                Cancelar Suscripción
              </button>
            </>
          )}
        </nav>
      </div>

      {showInstallHelp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={() => setShowInstallHelp(false)}>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-2">Instalar CargARG</h3>
            <p className="text-gray-300 text-sm mb-2">Para instalar la app:</p>
            <ul className="text-gray-400 text-sm list-disc pl-5 space-y-1">
              <li>En Android (Chrome): menú ⋮ → “Añadir a pantalla principal”.</li>
              <li>En iOS (Safari): botón Compartir → “Añadir a pantalla de inicio”.</li>
            </ul>
            <button className="mt-4 bg-brand-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-brand-500" onClick={() => setShowInstallHelp(false)}>Entendido</button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
