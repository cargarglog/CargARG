import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Load, User, UserRole, LoadStatus, Location, Plan } from '../types';
import { getDrivingDistance } from '../services/geminiService';
import { truckTypes } from '../constants';
import LoadCard from './LoadCard';

declare global {
    interface Window {
        google: any;
    }
}

// Haversine distance calculation for quick, synchronous filtering
const calcularDistancia = (p1: Location, p2: Location): number => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1.lat * Math.PI / 180) *
      Math.cos(p2.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};


const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(price);
};

const mapStyles = [ { "elementType": "geometry", "stylers": [ { "color": "#242f3e" } ] }, { "elementType": "labels.text.fill", "stylers": [ { "color": "#746855" } ] }, { "elementType": "labels.text.stroke", "stylers": [ { "color": "#242f3e" } ] }, { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [ { "color": "#d59563" } ] }, { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [ { "color": "#d59563" } ] }, { "featureType": "poi.park", "elementType": "geometry", "stylers": [ { "color": "#263c3f" } ] }, { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [ { "color": "#6b9a76" } ] }, { "featureType": "road", "elementType": "geometry", "stylers": [ { "color": "#38414e" } ] }, { "featureType": "road", "elementType": "geometry.stroke", "stylers": [ { "color": "#212a37" } ] }, { "featureType": "road", "elementType": "labels.text.fill", "stylers": [ { "color": "#9ca5b3" } ] }, { "featureType": "road.highway", "elementType": "geometry", "stylers": [ { "color": "#746855" } ] }, { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [ { "color": "#1f2835" } ] }, { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [ { "color": "#f3d19c" } ] }, { "featureType": "transit", "elementType": "geometry", "stylers": [ { "color": "#2f3948" } ] }, { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [ { "color": "#d59563" } ] }, { "featureType": "water", "elementType": "geometry", "stylers": [ { "color": "#17263c" } ] }, { "featureType": "water", "elementType": "labels.text.fill", "stylers": [ { "color": "#515c6d" } ] }, { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [ { "color": "#17263c" } ] } ];

interface DriverMapViewProps {
    user: User;
    availableLoads: Load[];
    userLocation: Location;
    onSelectLoad: (load: Load) => void;
}

const DriverMapView: React.FC<DriverMapViewProps> = ({ user, availableLoads, userLocation, onSelectLoad }) => {
    const mainMapRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initMap = async () => {
            if (!userLocation || !mainMapRef.current) return;
    
            try {
                const { Map } = await window.google.maps.importLibrary("maps");
                const { Marker, InfoWindow, Circle } = await window.google.maps.importLibrary("marker");
        
                const mainMap = new Map(mainMapRef.current, {
                    center: userLocation,
                    zoom: 8,
                    disableDefaultUI: false,
                    mapTypeControl: false,
                    streetViewControl: false,
                    styles: mapStyles,
                });
                
                new Marker({
                    position: userLocation,
                    map: mainMap,
                    title: "Tu ubicación",
                    icon: {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: "#4285F4",
                        fillOpacity: 1,
                        strokeWeight: 2,
                        strokeColor: "#fff",
                    },
                });
                
                const infoWindow = new InfoWindow({
                    content: '',
                    backgroundColor: '#2d3748', // gray-800
                });
        
                availableLoads.forEach((load) => {
                    const marker = new Marker({
                        position: load.startLocation,
                        map: mainMap,
                        title: `${load.startLocation.address} -> ${load.endLocation.address}`,
                        icon: "https://maps.google.com/mapfiles/ms/icons/truck.png",
                    });
        
                    marker.addListener("click", () => {
                        const content = `
                            <div class="p-2 text-gray-200">
                                <h3 class="font-bold text-lg text-blue-400">${load.startLocation.address} a ${load.endLocation.address}</h3>
                                <p class="text-gray-400">${load.cargoDetails}</p>
                                <p class="font-semibold text-green-400 text-md mt-2">${formatPrice(load.price)}</p>
                                <button id="info-window-btn-${load.id}" class="mt-2 bg-[#F57921] text-white font-bold py-1 px-3 rounded-md text-sm">Ver Detalles</button>
                            </div>`;
                        infoWindow.setContent(content);
                        infoWindow.open(mainMap, marker);
                        window.google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
                            const button = document.getElementById(`info-window-btn-${load.id}`);
                            if (button) {
                                button.addEventListener('click', () => onSelectLoad(load));
                            }
                        });
                    });
                });
        
                const radiusKm = user.plan === "silver" || user.plan === "gold" ? 250 : 150;
                new Circle({
                    strokeColor: "#00529B",
                    strokeOpacity: 0.7,
                    strokeWeight: 2,
                    fillColor: "#00529B",
                    fillOpacity: 0.1,
                    map: mainMap,
                    center: userLocation,
                    radius: radiusKm * 1000,
                });
                setIsLoading(false);
            } catch (error) {
                console.error("Error initializing map:", error);
                setIsLoading(false);
            }
        };

        initMap();
    }, [userLocation, availableLoads, onSelectLoad, user.plan]);

    if (isLoading) {
         return <div className="text-center p-8 bg-gray-800 rounded-lg shadow-sm h-[60vh] flex items-center justify-center">Inicializando mapas...</div>
    }

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div ref={mainMapRef} style={{ width: '100%', height: '60vh' }}></div>
        </div>
    );
}

interface DashboardProps {
  user: User;
  allUsers: User[];
  loads: Load[];
  onSelectLoad: (load: Load) => void;
  onNavigate: (page: string) => void;
  userLocation: Location | null;
}

const Dashboard: React.FC<DashboardProps> = ({ user, allUsers, loads, onSelectLoad, onNavigate, userLocation }) => {
    // Company Dashboard
    if (user.role === UserRole.COMPANY) {
        const companyAvailableLoads = loads.filter(l => l.companyId === user.id && l.status === LoadStatus.AVAILABLE);
        const companyInProgressLoads = loads.filter(l => l.companyId === user.id && l.status === LoadStatus.IN_PROGRESS);
        const companyCompletedLoads = loads.filter(l => l.companyId === user.id && l.status === LoadStatus.COMPLETED);
        const isVerifiedCompany = user.perfilEstado === 'validada';

        return (
            <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-100">Panel de {user.companyName}</h2>
                    <button onClick={() => onNavigate('postLoad')} disabled={!isVerifiedCompany} title={!isVerifiedCompany ? 'Debes verificar tu identidad para publicar cargas' : 'Publicar una nueva carga'} className={`font-bold py-2 px-4 rounded-md transition-all transform ${isVerifiedCompany ? 'bg-[#F57921] text-white hover:bg-opacity-90 hover:scale-105' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
                        <i className="fas fa-plus mr-2"></i>
                        {isVerifiedCompany ? 'Publicar Carga' : 'Verificación Requerida'}
                    </button>
                </div>
                <h3 className="text-xl font-bold text-gray-300 mb-4 mt-8">Cargas Activas</h3>
                <div className="space-y-4">{companyInProgressLoads.length > 0 ? companyInProgressLoads.map(load => (<LoadCard key={load.id} load={load} onSelect={onSelectLoad} userRole={user.role} />)) : (<p className="text-center text-gray-400 bg-gray-800 p-6 rounded-lg shadow-sm">No hay cargas en curso.</p>)}</div>
                <h3 className="text-xl font-bold text-gray-300 mb-4 mt-8">Cargas Disponibles</h3>
                <div className="space-y-4">{companyAvailableLoads.length > 0 ? companyAvailableLoads.map(load => (<LoadCard key={load.id} load={load} onSelect={onSelectLoad} userRole={user.role}/>)) : (<p className="text-center text-gray-400 bg-gray-800 p-6 rounded-lg shadow-sm">No tienes cargas disponibles publicadas.</p>)}</div>
                <h3 className="text-xl font-bold text-gray-300 mb-4 mt-8">Historial de Cargas</h3>
                <div className="space-y-4">{companyCompletedLoads.length > 0 ? companyCompletedLoads.map(load => (<LoadCard key={load.id} load={load} onSelect={onSelectLoad} userRole={user.role}/>)) : (<p className="text-center text-gray-400 bg-gray-800 p-6 rounded-lg shadow-sm">No hay cargas completadas.</p>)}</div>
            </div>
        );
    }
    
    // Driver Dashboard
    const [activeTab, setActiveTab] = useState<'available' | 'my_loads'>('available');
    const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
    const [sortOrder, setSortOrder] = useState<'price_asc' | 'price_desc' | 'default'>('default');
    const [filterTruckType, setFilterTruckType] = useState('all');
    const [filterPrice, setFilterPrice] = useState('all');
    const [loadDistances, setLoadDistances] = useState<Map<string, number | null>>(new Map());
    const [isLoadingDistances, setIsLoadingDistances] = useState(true);

    const availableLoadsForDriver = useMemo(() => loads.filter(l => l.status === LoadStatus.AVAILABLE), [loads]);
    const myInProgressLoads = useMemo(() => loads.filter(l => l.driverId === user.id && l.status === LoadStatus.IN_PROGRESS), [loads, user.id]);
    const myCompletedLoads = useMemo(() => loads.filter(l => l.driverId === user.id && l.status === LoadStatus.COMPLETED), [loads, user.id]);

    useEffect(() => {
        if (!userLocation || user.role !== UserRole.DRIVER) {
            setIsLoadingDistances(false);
            return;
        };
    
        const fetchDistances = async () => {
            setIsLoadingDistances(true);
            const newLoadDistances = new Map<string, number | null>();
            setLoadDistances(newLoadDistances);
    
            // Use a temporary array for distance fetching that is not affected by filters
            const loadsToFetch = availableLoadsForDriver.filter(load => {
                if (!userLocation) return false;
                const radius = user.plan === 'free' ? 150 : 250;
                return calcularDistancia(userLocation, load.startLocation) <= radius;
            });

            for (const load of loadsToFetch) {
                // No need to fetch all, just the ones that will be displayed
                getDrivingDistance(userLocation, load.startLocation.address).then(distance => {
                    setLoadDistances(prev => new Map(prev).set(load.id, distance));
                }).catch(error => {
                    console.error(`Error getting driving distance for load #${load.id}:`, error);
                    setLoadDistances(prev => new Map(prev).set(load.id, null));
                });
            }
            setIsLoadingDistances(false);
        };
        
        fetchDistances();
    }, [availableLoadsForDriver, userLocation, user.role, user.plan]);

    const filteredAndSortedLoads = useMemo(() => {
        const planToRank = (plan: Plan) => {
            if (plan === 'gold') return 2;
            if (plan === 'silver') return 1;
            return 0; // free
        };
        const allUsersMap = new Map<string, User>(allUsers.map(u => [u.id, u]));

        let processableLoads = [...availableLoadsForDriver].sort((a, b) => {
            const planA = planToRank(allUsersMap.get(a.companyId)?.plan || 'free');
            const planB = planToRank(allUsersMap.get(b.companyId)?.plan || 'free');
            return planB - planA;
        });
        
        // Fast, synchronous filtering by radius using Haversine formula
        if (userLocation) {
            const radius = user.plan === 'free' ? 150 : 250;
            processableLoads = processableLoads.filter(load => {
                const distance = calcularDistancia(userLocation, load.startLocation);
                return distance <= radius;
            });
        }

        let filtered = processableLoads;

        if (user.plan !== 'free') {
            if (filterTruckType !== 'all') {
                filtered = filtered.filter(l => l.requiredTruckType?.includes(filterTruckType) || !l.requiredTruckType);
            }
            if (filterPrice !== 'all') {
                const [min, max] = filterPrice.split('-').map(Number);
                filtered = filtered.filter(l => l.price >= min && (max ? l.price <= max : true));
            }
        }

        switch (sortOrder) {
            case 'price_asc': return [...filtered].sort((a, b) => a.price - b.price);
            case 'price_desc': return [...filtered].sort((a, b) => b.price - a.price);
            default: return filtered;
        }
    }, [availableLoadsForDriver, allUsers, sortOrder, filterTruckType, filterPrice, user.plan, userLocation]);

    const NavButton: React.FC<{ tabName: 'available' | 'my_loads'; icon: string; label: string }> = ({ tabName, icon, label }) => (
        <button
            onClick={() => setActiveTab(tabName)}
            className={`flex flex-col items-center justify-center w-full pt-2 pb-1 transition-colors duration-200 ${activeTab === tabName ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'}`}
        >
            <i className={`fas ${icon} text-xl`}></i>
            <span className="text-xs font-semibold mt-1">{label}</span>
        </button>
    );

    const FilterWrapper: React.FC<{ isLocked: boolean, label: string, children: React.ReactNode }> = ({ isLocked, label, children }) => (
        <div className="relative" title={isLocked ? "Disponible en Plan Silver" : ""}>
            <label className="block text-sm font-medium text-gray-400">{label}</label>
            {children}
            {isLocked && (
                <div className="absolute inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-end px-4 rounded-md cursor-not-allowed">
                    <i className="fas fa-lock text-gray-400"></i>
                </div>
            )}
        </div>
    );
    
    return (
        <div className="max-w-7xl mx-auto pb-24">
             <div className="p-4 sm:p-6 lg:p-8">
                {activeTab === 'available' && (
                    <>
                        <h2 className="text-2xl font-bold text-gray-100 mb-6">Cargas Disponibles</h2>
                        
                        {/* Plan Info Block */}
                        <div className="bg-blue-900/50 border-l-4 border-blue-500 text-blue-300 p-4 mb-6 rounded-md shadow flex justify-between items-center flex-wrap" role="alert">
                            <div>
                                <p className="font-bold flex items-center mb-1">
                                    <i className="fas fa-map-marked-alt mr-2"></i>
                                    {`Plan ${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} Activado`}: Radio de {user.plan === 'free' ? '150' : '250'} km
                                </p>
                                {user.plan === 'free' && <p className="text-sm">Estás viendo cargas dentro de tu radio de búsqueda. Para desbloquear filtros y un radio mayor, ¡mejora tu plan!</p>}
                            </div>
                            {user.plan === 'free' && (
                                <button onClick={() => onNavigate('plans')} className="mt-2 sm:mt-0 bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 transition-colors duration-300 transform hover:scale-105">
                                    <i className="fas fa-arrow-alt-circle-up mr-2"></i>Actualizar Plan
                                </button>
                            )}
                        </div>

                        {/* View Toggles */}
                        <div className="flex gap-2 mb-4">
                            <button onClick={() => setViewMode('list')} className={`px-4 py-2 rounded-md font-semibold transition-colors ${viewMode === 'list' ? 'bg-[#00529B] text-white shadow' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                                <i className="fas fa-list mr-2"></i>Ver Lista
                            </button>
                            <button onClick={() => setViewMode('map')} className={`px-4 py-2 rounded-md font-semibold transition-colors ${viewMode === 'map' ? 'bg-[#00529B] text-white shadow' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                                <i className="fas fa-map-marked-alt mr-2"></i>Ver Mapa
                            </button>
                        </div>

                        {/* Filters and Sorting */}
                        <div className="bg-gray-800 p-4 rounded-lg shadow-sm mb-6">
                            <div className="flex justify-between items-center flex-wrap gap-4">
                                <h3 className="text-lg font-bold text-gray-200">Filtrar y Ordenar</h3>
                                <div className="flex items-center gap-2">
                                    <label htmlFor="sort" className="text-sm font-medium text-gray-400">Ordenar por:</label>
                                    <select id="sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} className="p-2 border border-gray-600 bg-gray-700 text-white rounded-md text-sm focus:ring-[#F57921]">
                                        <option value="default">Recomendado</option>
                                        <option value="price_desc">Mayor Precio</option>
                                        <option value="price_asc">Menor Precio</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 border-t border-gray-700 pt-4">
                                <FilterWrapper isLocked={user.plan === 'free'} label="Tipo de Camión">
                                    <select value={filterTruckType} onChange={e => setFilterTruckType(e.target.value)} disabled={user.plan === 'free'} className="mt-1 block w-full p-2 border border-gray-600 bg-gray-700 text-white rounded-md shadow-sm focus:outline-none focus:ring-[#F57921] focus:border-[#F57921] sm:text-sm disabled:bg-gray-600">
                                        <option value="all">Todos</option>
                                        {truckTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                    </select>
                                </FilterWrapper>
                                <FilterWrapper isLocked={user.plan === 'free'} label="Rango de Precio (ARS)">
                                    <select value={filterPrice} onChange={e => setFilterPrice(e.target.value)} disabled={user.plan === 'free'} className="mt-1 block w-full p-2 border border-gray-600 bg-gray-700 text-white rounded-md shadow-sm focus:outline-none focus:ring-[#F57921] focus:border-[#F57921] sm:text-sm disabled:bg-gray-600">
                                        <option value="all">Todos</option>
                                        <option value="0-1800000">Menos de $1,800,000</option>
                                        <option value="1800000-2500000">$1,800,000 - $2,500,000</option>
                                        <option value="2500000">Más de $2,500,000</option>
                                    </select>
                                </FilterWrapper>
                            </div>
                        </div>
                        
                        {/* Conditional Content */}
                        {viewMode === 'list' ? (
                             <div className="space-y-4">
                                {userLocation ? (
                                    filteredAndSortedLoads.length > 0 ? filteredAndSortedLoads.map(load => {
                                        const distance = loadDistances.get(load.id);
                                        return ( <LoadCard key={load.id} load={load} onSelect={onSelectLoad} userRole={user.role} distance={distance}/> );
                                    }) : (<p className="text-center text-gray-400 bg-gray-800 p-8 rounded-lg shadow-sm">No hay cargas disponibles que coincidan con tus filtros y radio de búsqueda.</p>)
                                 ) : (
                                    <p className="text-center text-gray-400 bg-gray-800 p-8 rounded-lg shadow-sm flex items-center justify-center gap-2">
                                        <i className="fas fa-spinner fa-spin"></i>
                                        Esperando ubicación para mostrar cargas...
                                    </p>
                                )}
                            </div>
                        ) : (
                             userLocation ? (
                                <DriverMapView user={user} availableLoads={filteredAndSortedLoads} userLocation={userLocation} onSelectLoad={onSelectLoad} />
                            ) : (
                                <div className="text-center p-8 bg-gray-800 rounded-lg shadow-sm flex items-center justify-center gap-2 h-96">
                                    <i className="fas fa-spinner fa-spin"></i>
                                    Obteniendo ubicación para mostrar el mapa...
                                </div>
                            )
                        )}
                    </>
                )}
                {activeTab === 'my_loads' && (
                     <>
                        <h2 className="text-2xl font-bold text-gray-100 mb-6">Mis Viajes en Curso</h2>
                        <div className="space-y-4 mb-10">
                            {myInProgressLoads.length > 0 ? myInProgressLoads.map(load => ( <LoadCard key={load.id} load={load} onSelect={onSelectLoad} userRole={user.role}/> )) : (<p className="text-center text-gray-400 bg-gray-800 p-8 rounded-lg shadow-sm">No tienes viajes en curso en este momento.</p>)}
                        </div>
                        
                        <h2 className="text-2xl font-bold text-gray-100 mb-6">Historial de Viajes</h2>
                        <div className="space-y-4 mb-10">
                            {myCompletedLoads.length > 0 ? myCompletedLoads.map(load => ( <LoadCard key={load.id} load={load} onSelect={onSelectLoad} userRole={user.role}/> )) : (<p className="text-center text-gray-400 bg-gray-800 p-8 rounded-lg shadow-sm">No has completado ningún viaje todavía.</p>)}
                        </div>
                    </>
                )}
            </div>

            <div className="fixed bottom-0 left-0 right-0 h-16 bg-gray-800 border-t border-gray-700 shadow-md flex z-40 max-w-7xl mx-auto">
                <NavButton tabName="available" icon="fa-th-list" label="Disponibles" />
                <NavButton tabName="my_loads" icon="fa-truck" label="Mis Cargas" />
            </div>
        </div>
    );
};

export default Dashboard;
