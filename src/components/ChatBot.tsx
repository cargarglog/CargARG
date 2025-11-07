import React, { useState, useRef, useEffect } from 'react';
import { Load, User, UserRole, Plan, PlaceLocation, PaymentDetails, ChatMessage, LoadStatus, Location } from '../types';
// Heavy AI helpers are loaded dynamically where used to keep initial bundle small
import * as firestore from 'firebase/firestore';
import * as storage from 'firebase/storage';
import { db, storage as storageClient } from '../firebase';
import { truckTypes } from '../constants';

declare global {
    interface Window {
        google: any;
    }
}

// --- Type Definitions ---
export type CaptureTarget = 'dniFront' | 'dniBack' | 'licenseFront' | 'licenseBack' | 'selfie' | null;

// Re-creating PlanCard from LandingPage for use in PlansPage
const PlanCard: React.FC<{ title: string; price: string; features: string[]; primary?: boolean; planType: Plan; onSelectPlan: (plan: Plan) => void; currentUserPlan?: Plan; }> = ({ title, price, features, primary = false, planType, onSelectPlan, currentUserPlan }) => {
    const isCurrentPlan = currentUserPlan === planType;
    const planOrder: Plan[] = ['free', 'silver', 'gold'];
    const currentUserPlanIndex = currentUserPlan ? planOrder.indexOf(currentUserPlan) : -1;
    const planTypeIndex = planOrder.indexOf(planType);
    const cannotUpgrade = !!currentUserPlan && planTypeIndex <= currentUserPlanIndex;

    return (
        <div className={`border rounded-lg p-8 flex flex-col ${primary ? 'bg-[#00529B] text-white border-blue-700 transform scale-105 shadow-2xl' : 'bg-gray-800 text-gray-300 border-gray-700'}`}>
            <h3 className={`text-2xl font-bold ${primary ? '' : 'text-blue-400'}`}>{title}</h3>
            <p className={`text-4xl font-extrabold my-4 ${primary ? 'text-[#F57921]' : 'text-gray-100'}`}>{price}</p>
            <ul className={`space-y-3 mb-8 ${primary ? '' : 'text-gray-400'}`}>
                {features.map((feature, i) => (
                    <li key={i} className="flex items-start">
                        <i className={`fas fa-check-circle mr-3 mt-1 flex-shrink-0 ${primary ? 'text-green-300' : 'text-green-400'}`}></i>
                        <span>{feature}</span>
                    </li>
                ))}
            </ul>
            <button
                onClick={() => onSelectPlan(planType)}
                disabled={cannotUpgrade}
                className={`mt-auto font-bold py-3 px-6 rounded-md transition-colors 
                    ${primary ? 'bg-[#F57921] text-white hover:bg-orange-500' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}
                    ${(cannotUpgrade) ? 'opacity-50 cursor-not-allowed' : ''}
                `}
            >
                {isCurrentPlan ? 'Plan Actual' : (cannotUpgrade ? 'Plan Actual o Superior' : 'Seleccionar Plan')}
            </button>
        </div>
    );
};

// --- PlansPage Component ---
interface PlansPageProps {
    user: User;
    onBack: () => void;
    onUpgradePlan: (plan: Plan) => void;
}
export const PlansPage: React.FC<PlansPageProps> = ({ user, onBack, onUpgradePlan }) => {
    const plansForRole = user.role === UserRole.DRIVER ?
        // Driver Plans
        (
            <div className="grid md:grid-cols-2 gap-8 items-start max-w-4xl mx-auto">
                <PlanCard title="BASICO" price="Gratis" features={["5 asignaciones mensuales", "Rango de operación: 150 km", "Emparejamiento por IA", "Chat con IA (básico)"]} planType="free" onSelectPlan={onUpgradePlan} currentUserPlan={user.plan} />
                <PlanCard title="SILVER" price="USD 20/mes" features={["20 asignaciones mensuales", "Rango de operación: 250 km", "GPS con IA predictiva", "Filtros avanzados"]} primary planType="silver" onSelectPlan={onUpgradePlan} currentUserPlan={user.plan} />
            </div>
        ) :
        // Company Plans
        (
            <div className="grid md:grid-cols-2 gap-8 items-start max-w-4xl mx-auto">
                <PlanCard title="BASICO" price="Gratis" features={["15 publicaciones mensuales", "Emparejamiento por IA", "Chat con IA (básico)", "Identidad verificada"]} planType="free" onSelectPlan={onUpgradePlan} currentUserPlan={user.plan} />
                <PlanCard title="SILVER" price="USD 20/mes" features={["50 publicaciones mensuales", "Publicaciones destacadas", "Emparejamiento con camiones verificados", "Soporte prioritario"]} primary planType="silver" onSelectPlan={onUpgradePlan} currentUserPlan={user.plan} />
            </div>
        );

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
            <button onClick={onBack} className="text-blue-400 hover:underline mb-6">&larr; Volver al panel</button>
            <h2 className="text-3xl font-bold text-center text-gray-100 mb-4">Elige tu Plan</h2>
            <p className="text-center text-gray-400 mb-12">Desbloquea más funciones y haz crecer tu negocio con nuestros planes premium.</p>
            {plansForRole}
        </div>
    );
};

// --- VerifyAccountPage ---
interface VerifyAccountPageProps {
    email: string;
    onCheckVerification: () => void;
    onResendVerification: () => void;
    onLogout: () => void;
}
export const VerifyAccountPage: React.FC<VerifyAccountPageProps> = ({ email, onCheckVerification, onResendVerification, onLogout }) => {
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        if (cooldown > 0) {
            const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [cooldown]);

    const handleResend = () => {
        onResendVerification();
        setCooldown(60); // 60 second cooldown
    };

    return (
        <div className="max-w-md mx-auto mt-20 p-8 bg-gray-800 rounded-lg shadow-xl text-center">
            <i className="fas fa-envelope-open-text text-5xl text-blue-400 mb-6"></i>
            <h2 className="text-2xl font-bold text-white mb-4">Verifica tu correo electrónico</h2>
            <p className="text-gray-400 mb-6">Hemos enviado un enlace de verificación a <strong className="text-gray-200">{email}</strong>. Por favor, haz clic en el enlace para activar tu cuenta.</p>
            <div className="space-y-4">
                <button onClick={onCheckVerification} className="w-full bg-[#F57921] text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-all">
                    Ya verifiqué mi correo
                </button>
                <button onClick={handleResend} disabled={cooldown > 0} className="w-full bg-gray-700 text-gray-300 font-bold py-3 rounded-md hover:bg-gray-600 transition-all disabled:opacity-50">
                    {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar correo'}
                </button>
            </div>
            <button onClick={onLogout} className="text-gray-500 hover:text-red-400 mt-8 text-sm">Cerrar sesión</button>
        </div>
    );
};

// --- PendingVerificationPage ---
interface PendingVerificationPageProps {
    onLogout: () => void;
}
export const PendingVerificationPage: React.FC<PendingVerificationPageProps> = ({ onLogout }) => (
    <div className="max-w-md mx-auto mt-20 p-8 bg-gray-800 rounded-lg shadow-xl text-center">
        <i className="fas fa-user-clock text-5xl text-yellow-400 mb-6"></i>
        <h2 className="text-2xl font-bold text-white mb-4">Verificación en Proceso</h2>
        <p className="text-gray-400 mb-6">Hemos recibido tus documentos. Nuestro equipo los revisará en las próximas 24-48 horas hábiles. Recibirás una notificación por correo electrónico una vez que el proceso haya finalizado.</p>
        <button onClick={onLogout} className="text-gray-500 hover:text-red-400 mt-4 text-sm">Cerrar sesión</button>
    </div>
);


// --- LoadDetailsPage Component ---

// Simple map component for LoadDetails
const LoadDetailMap: React.FC<{ start: Location, end: Location }> = ({ start, end }) => {
    const mapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mapRef.current) return;
        const initMap = async () => {
            try {
                const { Map, LatLngBounds } = await window.google.maps.importLibrary("maps");
                const { Marker } = await window.google.maps.importLibrary("marker");
                 const map = new Map(mapRef.current!, {
                    disableDefaultUI: true,
                    styles: [ { "elementType": "geometry", "stylers": [ { "color": "#242f3e" } ] }, { "elementType": "labels.text.fill", "stylers": [ { "color": "#746855" } ] }, { "elementType": "labels.text.stroke", "stylers": [ { "color": "#242f3e" } ] }, { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [ { "color": "#d59563" } ] }, { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [ { "color": "#d59563" } ] }, { "featureType": "poi.park", "elementType": "geometry", "stylers": [ { "color": "#263c3f" } ] }, { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [ { "color": "#6b9a76" } ] }, { "featureType": "road", "elementType": "geometry", "stylers": [ { "color": "#38414e" } ] }, { "featureType": "road", "elementType": "geometry.stroke", "stylers": [ { "color": "#212a37" } ] }, { "featureType": "road", "elementType": "labels.text.fill", "stylers": [ { "color": "#9ca5b3" } ] }, { "featureType": "road.highway", "elementType": "geometry", "stylers": [ { "color": "#746855" } ] }, { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [ { "color": "#1f2835" } ] }, { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [ { "color": "#f3d19c" } ] }, { "featureType": "transit", "elementType": "geometry", "stylers": [ { "color": "#2f3948" } ] }, { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [ { "color": "#d59563" } ] }, { "featureType": "water", "elementType": "geometry", "stylers": [ { "color": "#17263c" } ] }, { "featureType": "water", "elementType": "labels.text.fill", "stylers": [ { "color": "#515c6d" } ] }, { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [ { "color": "#17263c" } ] } ]
                 });
                 const bounds = new LatLngBounds();
                 new Marker({ position: start, map, icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4CAF50', fillOpacity: 1, strokeWeight: 1, strokeColor: '#fff'} });
                 new Marker({ position: end, map, icon: "https://maps.google.com/mapfiles/ms/icons/truck.png" });
                 bounds.extend(start);
                 bounds.extend(end);
                 map.fitBounds(bounds, 50);
            } catch (error) {
                console.error("Failed to load Google Maps libraries:", error);
            }
        };
        initMap();
    }, [start, end]);

    return <div ref={mapRef} className="h-64 w-full rounded-lg" />;
};


// Chatbot component for LoadDetails
const ChatBot: React.FC<{ load: Load; user: User; userLocation: Location | null }> = ({ load, user, userLocation }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { sender: 'ai', text: 'Hola, soy tu asistente de CargARG. ¿En qué puedo ayudarte con esta carga?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    useEffect(scrollToBottom, [messages]);
    
    const handleSend = async () => {
        if (!input.trim()) return;
        const userMessage: ChatMessage = { sender: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        const { getChatResponse } = await import('../services/geminiService');
        const aiResponse = await getChatResponse(input, load, user, userLocation);
        const aiMessage: ChatMessage = { sender: 'ai', text: aiResponse.text, sources: aiResponse.sources };
        setMessages(prev => [...prev, aiMessage]);
        setIsLoading(false);
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-inner flex flex-col h-full max-h-[70vh]">
            <div className="p-4 border-b border-gray-700">
                <h3 className="text-lg font-bold text-blue-400">Asistente IA</h3>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.sender === 'ai' && <i className="fas fa-robot text-blue-400 text-xl self-start"></i>}
                        <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${msg.sender === 'user' ? 'bg-[#00529B] text-white' : 'bg-gray-700 text-gray-200'}`}>
                            <p>{msg.text}</p>
                            {msg.sources && (
                                <div className="mt-2 pt-2 border-t border-gray-600">
                                    <p className="text-xs font-semibold text-gray-400 mb-1">Fuentes:</p>
                                    <ul className="text-xs space-y-1">
                                    {msg.sources.map((source, i) => (
                                        <li key={i}><a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate block">{source.title}</a></li>
                                    ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                 {isLoading && <div className="flex justify-start"><i className="fas fa-spinner fa-spin text-blue-400 text-xl"></i></div>}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-gray-700">
                <div className="flex gap-2">
                    <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} placeholder="Pregunta sobre la carga..." className="flex-1 p-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#F57921]" />
                    <button onClick={handleSend} disabled={isLoading} className="bg-[#F57921] px-4 rounded-md text-white font-bold disabled:opacity-50"><i className="fas fa-paper-plane"></i></button>
                </div>
            </div>
        </div>
    );
};

interface LoadDetailsPageProps {
    load: Load;
    user: User;
    userLocation: Location | null;
    onBack: () => void;
    onAcceptLoad: (load: Load) => void;
    onCompleteLoad: (load: Load, podUrl: string, rating: number) => void;
}

export const LoadDetailsPage: React.FC<LoadDetailsPageProps> = ({ load, user, onBack, onAcceptLoad, onCompleteLoad, userLocation }) => {
    const [showCompleteModal, setShowCompleteModal] = useState(false);
    const [rating, setRating] = useState(0);
    const [podFile, setPodFile] = useState<File | null>(null);
    const [isCompleting, setIsCompleting] = useState(false);

    const handleComplete = async () => {
        if (!podFile || rating === 0) {
            alert("Por favor, sube el remito y deja una calificación.");
            return;
        }
        setIsCompleting(true);
        try {
            const storageRef = storage.ref(storageClient, `pods/${load.id}/${podFile.name}`);
            const snapshot = await storage.uploadBytes(storageRef, podFile);
            const podUrl = await storage.getDownloadURL(snapshot.ref);
            onCompleteLoad(load, podUrl, rating);
        } catch (error) {
            console.error("Error al subir el remito:", error);
            alert("Error al completar la carga. Inténtalo de nuevo.");
        } finally {
            setIsCompleting(false);
            setShowCompleteModal(false);
        }
    };
    
    const isDriver = user.role === UserRole.DRIVER;
    const isCompany = user.role === UserRole.COMPANY;

    const canAccept = isDriver && load.status === LoadStatus.AVAILABLE;
    const canComplete = isDriver && load.status === LoadStatus.IN_PROGRESS && load.driverId === user.id;

    const formatPrice = (price: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price);

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
            <button onClick={onBack} className="text-blue-400 hover:underline mb-6">&larr; Volver</button>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Details Column */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-white">Detalles de la Carga #{load.id.substring(0,6)}</h2>
                            <p className="text-gray-400">Publicado por {load.company}</p>
                        </div>
                        <span className="text-2xl font-bold text-green-400">{formatPrice(load.price)}</span>
                    </div>

                    <LoadDetailMap start={load.startLocation} end={load.endLocation} />

                    <div className="mt-6 space-y-4">
                        <div><h4 className="font-bold text-blue-400">Origen:</h4><p>{load.startLocation.address}</p></div>
                        <div><h4 className="font-bold text-blue-400">Destino:</h4><p>{load.endLocation.address}</p></div>
                        <div><h4 className="font-bold text-blue-400">Carga:</h4><p>{load.cargoDetails}</p></div>
                        {load.requiredTruckType && <div><h4 className="font-bold text-blue-400">Camión Requerido:</h4><p className="capitalize">{load.requiredTruckType.join(', ')}</p></div>}
                        {load.requirements?.length > 0 && <div><h4 className="font-bold text-blue-400">Requisitos:</h4><p>{load.requirements.join(', ')}</p></div>}
                    </div>

                    {canAccept && <button onClick={() => onAcceptLoad(load)} className="w-full mt-6 bg-[#F57921] text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-all">Aceptar Viaje</button>}
                    {canComplete && <button onClick={() => setShowCompleteModal(true)} className="w-full mt-6 bg-green-600 text-white font-bold py-3 rounded-md hover:bg-green-700 transition-all">Completar Viaje</button>}
                </div>

                {/* Chat Column */}
                <div className="h-[70vh]">
                    <ChatBot load={load} user={user} userLocation={userLocation} />
                </div>
            </div>

            {/* Complete Load Modal */}
            {showCompleteModal && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
                    <div className="bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-2xl font-bold mb-6">Completar Viaje</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Subir Remito (POD)</label>
                                <input type="file" onChange={e => setPodFile(e.target.files ? e.target.files[0] : null)} className="w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Calificar a la empresa</label>
                                <div className="flex justify-center text-3xl">
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <button key={star} onClick={() => setRating(star)} className={`mx-1 ${star <= rating ? 'text-yellow-400' : 'text-gray-600'}`}>
                                            <i className="fas fa-star"></i>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-4 mt-8">
                            <button onClick={() => setShowCompleteModal(false)} className="bg-gray-700 py-2 px-4 rounded-md">Cancelar</button>
                            <button onClick={handleComplete} disabled={isCompleting} className="bg-green-600 text-white font-bold py-2 px-4 rounded-md disabled:bg-gray-500">{isCompleting ? 'Procesando...' : 'Confirmar'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// --- PostLoadPage Component ---
export const PostLoadPage: React.FC<{ user: User; onAddLoad: (load: Omit<Load, 'id' | 'createdAt'>) => void; onBack: () => void; }> = ({ user, onAddLoad, onBack }) => {
    const [title, setTitle] = useState('');
    const [startLocation, setStartLocation] = useState<PlaceLocation | null>(null);
    const [endLocation, setEndLocation] = useState<PlaceLocation | null>(null);
    const [distanceKm, setDistanceKm] = useState<number | null>(null);
    const [price, setPrice] = useState<number | ''>('');
    const [currency, setCurrency] = useState<'ARS' | 'USD' | 'BRL'>('ARS');
    const [cargoDetails, setCargoDetails] = useState('');
    const [requiredTruckType, setRequiredTruckType] = useState<string[]>([]);
    const [otherTruckType, setOtherTruckType] = useState('');
    const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({ method: 'transferencia', terms: 'Transferencia bancaria', methods: ['transferencia'] });
    const [chequeDays, setChequeDays] = useState<string>('');
    const [splitPayment, setSplitPayment] = useState(false);
    const [originPercent, setOriginPercent] = useState<number | ''>('');
    const [destinationPercent, setDestinationPercent] = useState<number | ''>('');
    const [billingType, setBillingType] = useState<'remito' | 'factura'>('remito');
    const [iva, setIva] = useState<'con' | 'sin'>('con');
    const [slots, setSlots] = useState<number | ''>('');
    const [error, setError] = useState<string>('');
    
    const startInputRef = useRef<HTMLInputElement>(null);
    const endInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const initAutocomplete = async () => {
            try {
                const { Autocomplete } = await window.google.maps.importLibrary("places");
                
                const options = {
                    componentRestrictions: { country: "ar" },
                    fields: ["address_components", "geometry", "icon", "name", "formatted_address", "place_id"],
                    types: ["geocode"],
                };

                if (startInputRef.current) {
                    const autocompleteStart = new Autocomplete(startInputRef.current, options);
                    autocompleteStart.addListener('place_changed', () => {
                        const place = autocompleteStart.getPlace();
                        if (place.geometry && place.geometry.location && place.formatted_address && place.place_id) {
                            setStartLocation({
                                address: place.formatted_address,
                                lat: place.geometry.location.lat(),
                                lng: place.geometry.location.lng(),
                                placeId: place.place_id,
                            });
                            setError(''); // Clear error on valid selection
                            setTimeout(calcDistance, 0);
                        }
                    });
                }

                if (endInputRef.current) {
                    const autocompleteEnd = new Autocomplete(endInputRef.current, options);
                    autocompleteEnd.addListener('place_changed', () => {
                        const place = autocompleteEnd.getPlace();
                        if (place.geometry && place.geometry.location && place.formatted_address && place.place_id) {
                            setEndLocation({
                                address: place.formatted_address,
                                lat: place.geometry.location.lat(),
                                lng: place.geometry.location.lng(),
                                placeId: place.place_id,
                            });
                             setError(''); // Clear error on valid selection
                             setTimeout(calcDistance, 0);
                        }
                    });
                }
            } catch (error) {
                console.error("Failed to load Google Maps Places library:", error);
                setError("No se pudo cargar el servicio de autocompletado de direcciones.");
            }
        };

        initAutocomplete();

    }, []);

    const handlePaymentMethodChange = (method: 'transferencia' | 'efectivo' | 'cheque') => {
        const main = method;
        const methods = [method];
        const terms = main === 'transferencia' ? 'Transferencia bancaria' : main === 'efectivo' ? 'Pago en efectivo' : `Cheque a ${chequeDays || 'X'} días`;
        setPaymentDetails({ method: main, terms, methods, chequeDays: method === 'cheque' ? Number(chequeDays || 0) : undefined, splitOriginDestination: splitPayment, originPercent: Number(originPercent || 0), destinationPercent: Number(destinationPercent || 0) });
    };

    useEffect(() => {
        if (paymentDetails.method === 'cheque') {
            setPaymentDetails(prev => ({ ...prev, terms: `Cheque a ${chequeDays || 'X'} días`, chequeDays: Number(chequeDays || 0) }));
        }
    }, [chequeDays, paymentDetails.method]);


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!title.trim()) { setError('El título es obligatorio.'); return; }
        if (!startLocation || !endLocation) {
            setError('Por favor, selecciona un origen y destino válidos de la lista de sugerencias.');
            return;
        }
        if (!price) {
            setError('Debes especificar un precio para la carga.');
            return;
        }
        const _s = String(price);
        if (_s.length >= 4) {
            const rep = /^(\d)\1{3,}$/.test(_s);
            let asc = true, desc = true; for (let i=1;i<_s.length;i++){ const d=+_s[i]-(+_s[i-1]); if(d!==1) asc=false; if(d!==-1) desc=false; }
            if (rep || asc || desc) { setError('El precio no puede contener secuencias numéricas consecutivas o repetidas.'); return; }
        }
        if (user.plan === 'silver' && (slots === '' || Number(slots) <= 0)) { setError('Debes especificar la cantidad de cupos para el plan Silver.'); return; }

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
            company: user.companyName || 'Empresa Desconocida',
            cargoDetails,
            requirements: [],
            requiredTruckType: requiredTruckType,
            otherTruckType: requiredTruckType.includes('otro') ? (otherTruckType || undefined) : undefined,
            paymentDetails: {
                ...paymentDetails,
                splitOriginDestination: splitPayment,
                originPercent: splitPayment ? Number(originPercent || 0) : undefined,
                destinationPercent: splitPayment ? Number(destinationPercent || 0) : undefined,
            },
            billing: { type: billingType, iva: billingType === 'factura' ? iva : undefined },
            slots: user.plan === 'silver' ? Number(slots || 0) : undefined,
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
                    <label htmlFor="startLocation" className="block text-sm font-medium text-gray-400 mb-2">Dirección de Origen</label>
                    <input id="startLocation" ref={startInputRef} type="text" placeholder="Comienza a escribir la dirección..." required className="w-full p-3 bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F57921]" />
                </div>

                <div>
                    <label htmlFor="endLocation" className="block text-sm font-medium text-gray-400 mb-2">Dirección de Destino</label>
                    <input id="endLocation" ref={endInputRef} type="text" placeholder="Comienza a escribir la dirección..." required className="w-full p-3 bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-[#F57921]" />
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
                     <label htmlFor="cargoDetails" className="block text-sm font-medium text-gray-400 mb-2">Detalles de la Carga</label>
                    <textarea id="cargoDetails" placeholder="Ej: 24 pallets, 15 toneladas, mercadería general" value={cargoDetails} onChange={e => setCargoDetails(e.target.value)} required className="w-full p-3 bg-gray-700 rounded-md h-24" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Método y Términos de Pago</label>
                    <div className="flex gap-2 mb-2">
                        {(['transferencia', 'efectivo', 'cheque'] as const).map(method => (
                            <button key={method} type="button" onClick={() => handlePaymentMethodChange(method)} className={`flex-1 p-2 rounded-md font-semibold text-center transition ${paymentDetails.method === method ? 'bg-[#00529B] text-white' : 'bg-gray-700 text-gray-300'}`}>
                                {method.charAt(0).toUpperCase() + method.slice(1)}
                            </button>
                        ))}
                    </div>
                        {paymentDetails.method === 'cheque' && (
                        <input type="text" placeholder="Días del cheque (ej: 30, 60, 90)" value={chequeDays} onChange={e => setChequeDays(e.target.value)} className="w-full p-3 mt-2 bg-gray-700 rounded-md" />
                    )}
                    <input type="text" placeholder="Términos" value={paymentDetails.terms} onChange={e => setPaymentDetails(prev => ({ ...prev, terms: e.target.value }))} className="w-full p-3 mt-2 bg-gray-700 rounded-md" />
                    <div className="mt-3">
                        <label className="inline-flex items-center gap-2">
                            <input type="checkbox" checked={splitPayment} onChange={e => setSplitPayment(e.target.checked)} /> Pago parte en origen y parte en destino
                        </label>
                        {splitPayment && (
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <input type="number" placeholder="% Origen" value={originPercent} onChange={e=>setOriginPercent(e.target.value === '' ? '' : Number(e.target.value))} className="p-3 bg-gray-700 rounded-md" />
                                <input type="number" placeholder="% Destino" value={destinationPercent} onChange={e=>setDestinationPercent(e.target.value === '' ? '' : Number(e.target.value))} className="p-3 bg-gray-700 rounded-md" />
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Tipo de Camión Requerido</label>
                    <select multiple value={requiredTruckType} onChange={e => setRequiredTruckType(Array.from(e.target.selectedOptions, option => option.value))} className="w-full p-3 bg-gray-700 rounded-md h-32">
                        {truckTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                    {requiredTruckType.includes('otro') && (
                        <input type="text" placeholder="Describe el camión" value={otherTruckType} onChange={e=>setOtherTruckType(e.target.value)} className="w-full p-3 mt-2 bg-gray-700 rounded-md" />
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Remito o Factura</label>
                    <div className="flex gap-4">
                        <label className="inline-flex items-center gap-2"><input type="radio" name="billingType" checked={billingType==='remito'} onChange={()=>setBillingType('remito')} /> Remito</label>
                        <label className="inline-flex items-center gap-2"><input type="radio" name="billingType" checked={billingType==='factura'} onChange={()=>setBillingType('factura')} /> Factura</label>
                        {billingType==='factura' && (
                            <div className="flex gap-3 ml-4">
                                <label className="inline-flex items-center gap-2"><input type="radio" name="iva" checked={iva==='con'} onChange={()=>setIva('con')} /> Con IVA</label>
                                <label className="inline-flex items-center gap-2"><input type="radio" name="iva" checked={iva==='sin'} onChange={()=>setIva('sin')} /> Sin IVA</label>
                            </div>
                        )}
                    </div>
                </div>

                {user.plan==='silver' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Cupos (viajes posibles)</label>
                        <input type="number" value={slots} onChange={e=>setSlots(e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-3 bg-gray-700 rounded-md" required />
                    </div>
                )}

                {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-center">{error}</p>}
                
                <button type="submit" className="w-full bg-[#F57921] text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-all">Publicar Carga</button>
            </form>
        </div>
    );
};


// --- VerifyIdPage Component ---
const dataURLtoBlob = (dataurl: string): Blob => {
    const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

export const VerifyIdPage: React.FC<{ user: User; onIdentitySubmitted: (dni: string, finalState: 'pendiente' | 'validada' | 'rechazada' | 'pendiente_manual') => void; onLogout: () => void; }> = ({ user, onIdentitySubmitted, onLogout }) => {
    const [step, setStep] = useState<CaptureTarget>('dniFront');
    const [images, setImages] = useState<{ dniFront?: string; dniBack?: string; selfie?: string }>({});
    const [imageUris, setImageUris] = useState<{ dniFront?: string; dniBack?: string; selfie?: string }>({});
    const [dniNumber, setDniNumber] = useState('');
    const [feedback, setFeedback] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [attemptRef, setAttemptRef] = useState<firestore.DocumentReference | null>(null);
    
    const tipsForStep = (s: CaptureTarget): string[] => {
        if (s === 'selfie') {
            return [
                'Sosten el telefono en horizontal (paisaje).',
                'Centra tu rostro dentro del ovalo, cabeza completa.',
                'Quita gafas/visera; busca luz frontal y uniforme.',
                'Evita contraluz y fondos con mucho brillo.'
            ];
        }
        if (s === 'dniFront' || s === 'dniBack' || s === 'licenseFront' || s === 'licenseBack') {
            return [
                'Alinea el DNI/licencia dentro del rectangulo punteado.',
                'Evita reflejos; usa luz lateral suave.',
                'Apoya el documento sobre fondo liso y oscuro.',
                'Toca sobre el DNI para enfocar.'
            ];
        }
        return [];
    };
    const overlayRef = useRef<HTMLDivElement>(null);
    const [focusUI, setFocusUI] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
    const videoTrackRef = useRef<any>(null);
    const videoCapsRef = useRef<any>(null);

    const startCamera = async (facingMode: 'user' | 'environment') => {
        try {
            if (videoRef.current) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
                videoRef.current.srcObject = stream;
                videoRef.current.muted = true;
                videoRef.current.setAttribute('playsinline', 'true');
                await videoRef.current.play();
                // Cache track + capabilities; try continuous AF/AE/AWB if supported
                try {
                    const streamAny: any = videoRef.current.srcObject as any;
                    const track: any = streamAny?.getVideoTracks ? streamAny.getVideoTracks()[0] : null;
                    videoTrackRef.current = track;
                    if (track?.getCapabilities) {
                        try { videoCapsRef.current = track.getCapabilities(); } catch { videoCapsRef.current = null; }
                    }
                    if (track && track.applyConstraints) {
                        await track.applyConstraints({
                            advanced: [
                                { focusMode: 'continuous' as any },
                                { exposureMode: 'continuous' as any },
                                { whiteBalanceMode: 'continuous' as any }
                            ]
                        } as any).catch(() => {});
                    }
                } catch (e) {
                    console.warn('[Camera] Autofocus constraints not available:', e);
                }
            }
        } catch (error) {
            console.error("Error al acceder a la cámara:", error);
            setFeedback("No se pudo acceder a la cámara. Revisa los permisos.");
        }
    };
    
    // Inicializa/Reanuda intento (Integraci�n de verificaci�n extendida)
    useEffect(() => {
        (async () => {
            try {
                if (!attemptRef) {
                    const { startOrResumeAttempt } = await import('../services/verificationOrchestrator');
                    const ctx = await startOrResumeAttempt(user.id);
                    setAttemptRef(ctx.ref);
                    setAttemptNumber(ctx.attemptNumber);
                }
            } catch (e) {
                console.warn('[VerifyId] No se pudo inicializar/reanudar el intento:', e);
            }
        })();
        if (step === 'dniFront' || step === 'dniBack' || step === 'licenseFront' || step === 'licenseBack') {
            startCamera('environment');
        } else if (step === 'selfie') {
            startCamera('user');
        }
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            }
        };
    }, [step]);
    
    const handleCapture = async () => {
        if (!videoRef.current || !canvasRef.current || !step) return;
        setFeedback('');
        setIsLoading(true);

        const video = videoRef.current;
        const canvas = canvasRef.current;
        // Reglas de orientaci�n para selfie: exigir horizontal (paisaje)
        if (step === 'selfie') {
            const isLandscape = video.videoWidth >= video.videoHeight;
            if (!isLandscape) {
                setFeedback('Para la selfie, gira el tel�fono a horizontal y asegúrate de que la cabeza entre completa en el óvalo.');
                setIsLoading(false);
                return;
            }
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const base64Data = imageDataUrl.split(',')[1];
        
        const mod = await import('../services/geminiService');
        const { ready, feedback: aiFeedback } = await mod.analyzeImageForVerification(base64Data, step);
        
        if (ready) {
            setImages(prev => ({ ...prev, [step]: base64Data }));
            // Subir imagen y actualizar estado del intento por paso
            try {
                if (attemptRef) {
                    const blob = dataURLtoBlob(`data:image/jpeg;base64,${base64Data}`);
                    const name = step === 'dniFront' ? 'dni_front' : step === 'dniBack' ? 'dni_back' : step === 'licenseFront' ? 'license_front' : step === 'licenseBack' ? 'license_back' : 'selfie';
                    const fileRef = storage.ref(storageClient, `verifications/${user.id}/${attemptRef.id}/${name}.jpg`);
                    await storage.uploadBytes(fileRef, blob);
                    const url = await storage.getDownloadURL(fileRef);
                    setImageUris(prev => ({ ...prev, [step]: url }));
                    const update: any = { updatedAt: firestore.serverTimestamp() };
                    if (step === 'dniFront') { update.dniFrontUri = url;  }
                    if (step === 'dniBack') { update.dniBackUri = url;  }
                    if (step === 'licenseFront') { (update as any)['licenseFrontUri'] = url;  }
                    if (step === 'licenseBack') { (update as any)['licenseBackUri'] = url;  }
                    if (step === 'selfie') { update.selfieUri = url;  }
                    await firestore.updateDoc(attemptRef, update);
                }
            } catch (e) {
                console.warn('[VerifyId] No se pudo subir imagen del paso:', e);
            }
            switch (step) {
                case 'dniFront': setStep('dniBack'); break;
                case 'dniBack': setStep(user.role === UserRole.DRIVER ? 'licenseFront' : 'selfie'); break;
                case 'licenseFront': setStep('licenseBack'); break;
                case 'licenseBack': setStep('selfie'); break;
                case 'selfie': setStep(null); break; // Move to final review step
            }
        } else {
            setFeedback(aiFeedback);
        }
        setIsLoading(false);
    };

    const handleFinalSubmit = async () => {
        if (!images.dniFront || !images.dniBack || !images.selfie) {
            setFeedback("Faltan fotos. Captura frente, dorso y selfie.");
            return;
        }
        setIsLoading(true);
        setFeedback("Enviando documentaci�n para verificaci�n...");

        // --- Firestore Logging (unificado) ---
        let localAttemptRef = attemptRef;
        if (!localAttemptRef) {
            const attemptsCol = firestore.collection(db, 'identity_verification_logs', user.id, 'attempts');
            const snap = await firestore.getDocs(attemptsCol);
            const nextNumber = (snap?.size || snap?.docs?.length || 0) + 1;
            const engine = nextNumber === 1 ? 'gemini' : (nextNumber <= 3 ? 'google_cloud' : 'staff');
            localAttemptRef = firestore.doc(attemptsCol);
            await firestore.setDoc(localAttemptRef, { attemptId: localAttemptRef.id, attemptNumber: nextNumber, engine, status: 'pending', attemptStatus: 'pending', components: {}, createdAt: firestore.serverTimestamp(), updatedAt: firestore.serverTimestamp() });
            setAttemptRef(localAttemptRef);
        }
        const ensureUpload = async (maybeUri: string | undefined, base64: string, name: string): Promise<string> => {
            if (maybeUri) return maybeUri;
            const blob = dataURLtoBlob(`data:image/jpeg;base64,${base64}`);
            const fileRef = storage.ref(storageClient, `verifications/${user.id}/${localAttemptRef!.id}/${name}.jpg`);
            await storage.uploadBytes(fileRef, blob);
            return storage.getDownloadURL(fileRef);
        };
        const dniFrontUri = await ensureUpload(imageUris.dniFront, images.dniFront!, 'dni_front');
        const dniBackUri = await ensureUpload(imageUris.dniBack, images.dniBack!, 'dni_back');
        const licenseFrontUri = images.licenseFront ? await ensureUpload(imageUris.licenseFront, images.licenseFront!, 'license_front') : imageUris.licenseFront || '';
        const licenseBackUri = images.licenseBack ? await ensureUpload(imageUris.licenseBack, images.licenseBack!, 'license_back') : imageUris.licenseBack || '';
        const selfieUri = await ensureUpload(imageUris.selfie, images.selfie!, 'selfie');

        await firestore.setDoc(localAttemptRef, {
            attemptId: localAttemptRef.id,
            userSubmittedDni: dniNumber || null,
            dniFrontUri, dniBackUri, licenseFrontUri, licenseBackUri, selfieUri,
            updatedAt: firestore.serverTimestamp(),
            finalState: 'pendiente_manual',
        }, { merge: true });

        // Orquestador: decide proveedor seg�n n�mero de intento
        try {
            const { finalizeAttemptAndRoute } = await import('../services/verificationOrchestrator');
            await finalizeAttemptAndRoute({
                uid: user.id,
                attemptRef: localAttemptRef,
                attemptNumber,
                selfieUri,
                dniFrontUri,
                dniBackUri,
                licenseFrontUri,
                licenseBackUri,
                dniNumber,
            });
        } catch (e) {
            console.warn('[VerifyId] Orquestaci�n fall�:', e);
        }

        onIdentitySubmitted(dniNumber, 'pending_review');
        setIsLoading(false);
    };

    const titles: Record<string, string> = {
        dniFront: "Frente del Documento",
        dniBack: "Dorso del Documento",
        licenseFront: "Licencia (Frente)",
        licenseBack: "Licencia (Dorso)",
        selfie: "Tómate una Selfie",
    };
    
    return (
        <div className="max-w-lg mx-auto p-6 bg-gray-800 rounded-lg shadow-xl mt-8">
            <h2 className="text-2xl font-bold mb-2">Verificación de Identidad</h2>
            <p className="text-gray-400 mb-6">Para tu seguridad, necesitamos verificar tu identidad. Este proceso solo toma un minuto.</p>

            {step ? (
                <div>
                    <h3 className="text-xl font-semibold mb-2 text-blue-400">{titles[step!]}</h3>
                    <div className="mb-3 text-xs text-gray-200 bg-gray-700/60 p-2 rounded">
                        <ul className="list-disc list-inside space-y-1">
                            {tipsForStep(step).map((t, i) => (<li key={i}>{t}</li>))}
                        </ul>
                    </div>
                    <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                        <div
                          ref={overlayRef}
                          onClick={(ev) => {
                            if (!videoRef.current || !overlayRef.current) return;
                            const rect = overlayRef.current.getBoundingClientRect();
                            const xPx = ev.clientX - rect.left;
                            const yPx = ev.clientY - rect.top;
                            const x = Math.max(0, Math.min(1, xPx / rect.width));
                            const y = Math.max(0, Math.min(1, yPx / rect.height));
                            const track: any = videoTrackRef.current;
                            const caps: any = videoCapsRef.current || {};
                            if (track && track.applyConstraints) {
                              (async () => {
                                try {
                                  if (caps.pointsOfInterest) {
                                    await track.applyConstraints({ advanced: [ { pointsOfInterest: [{ x, y }] as any } ] } as any);
                                  } else if (Array.isArray(caps.focusMode) && caps.focusMode.includes('single-shot')) {
                                    await track.applyConstraints({ advanced: [ { focusMode: 'single-shot' as any } ] } as any);
                                  } else if (caps.focusDistance && typeof caps.focusDistance.min === 'number') {
                                    const mid = (caps.focusDistance.min + caps.focusDistance.max) / 2;
                                    await track.applyConstraints({ advanced: [ { focusMode: 'manual' as any, focusDistance: mid } ] } as any);
                                  } else if (caps.zoom && typeof caps.zoom.min === 'number') {
                                    const z = caps.zoom.min + (caps.zoom.max - caps.zoom.min) * 0.5;
                                    await track.applyConstraints({ advanced: [ { zoom: z } ] } as any);
                                  }
                                } catch {}
                              })();
                            }
                            setFocusUI({ x: xPx, y: yPx, visible: true });
                            setTimeout(() => setFocusUI(prev => ({ ...prev, visible: false })), 800);
                          }}
                          onTouchStart={(ev) => {
                            if (!overlayRef.current || !videoRef.current) return;
                            const t = ev.touches[0];
                            const rect = overlayRef.current.getBoundingClientRect();
                            const xPx = t.clientX - rect.left;
                            const yPx = t.clientY - rect.top;
                            const x = Math.max(0, Math.min(1, xPx / rect.width));
                            const y = Math.max(0, Math.min(1, yPx / rect.height));
                            const track: any = videoTrackRef.current;
                            const caps: any = videoCapsRef.current || {};
                            if (track && track.applyConstraints) {
                              (async () => {
                                try {
                                  if (caps.pointsOfInterest) {
                                    await track.applyConstraints({ advanced: [ { pointsOfInterest: [{ x, y }] as any } ] } as any);
                                  } else if (Array.isArray(caps.focusMode) && caps.focusMode.includes('single-shot')) {
                                    await track.applyConstraints({ advanced: [ { focusMode: 'single-shot' as any } ] } as any);
                                  } else if (caps.focusDistance && typeof caps.focusDistance.min === 'number') {
                                    const mid = (caps.focusDistance.min + caps.focusDistance.max) / 2;
                                    await track.applyConstraints({ advanced: [ { focusMode: 'manual' as any, focusDistance: mid } ] } as any);
                                  } else if (caps.zoom && typeof caps.zoom.min === 'number') {
                                    const z = caps.zoom.min + (caps.zoom.max - caps.zoom.min) * 0.5;
                                    await track.applyConstraints({ advanced: [ { zoom: z } ] } as any);
                                  }
                                } catch {}
                              })();
                            }
                            setFocusUI({ x: xPx, y: yPx, visible: true });
                            setTimeout(() => setFocusUI(prev => ({ ...prev, visible: false })), 800);
                          }}
                          className="absolute inset-0 border-4 border-dashed border-gray-500 rounded-lg cursor-crosshair"
                        >
                          {(step === 'dniFront' || step === 'dniBack' || step === 'licenseFront' || step === 'licenseBack') && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="border-2 border-dashed border-green-400 rounded-md" style={{ width: '80%', aspectRatio: '1.586' }} />
                            </div>
                          )}
                          {step === 'selfie' && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="border-2 border-dashed border-green-400 rounded-full" style={{ width: '80%', height: '65%' }} />
                            </div>
                          )}
                          {focusUI.visible && (
                            <span
                              style={{ left: focusUI.x - 20, top: focusUI.y - 20 }}
                              className="absolute w-10 h-10 rounded-full border-2 border-[#F57921] pointer-events-none animate-ping"
                            />
                          )}
                          <span className="absolute bottom-2 right-2 text-[10px] bg-black/60 text-gray-200 px-2 py-1 rounded">Toca para enfocar</span>
                        </div>
                    </div>
                    <canvas ref={canvasRef} className="hidden"></canvas>
                    <button onClick={handleCapture} disabled={isLoading} className="w-full mt-4 bg-[#00529B] text-white font-bold py-3 rounded-md hover:bg-opacity-90 disabled:opacity-50">
                        {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-camera mr-2"></i>Capturar</>}
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-blue-400">Último Paso</h3>
                    <p>Por favor, ingresa tu número de documento para la verificación final.</p>
                    <input type="text" placeholder="Número de Documento" value={dniNumber} onChange={e => setDniNumber(e.target.value)} className="w-full p-3 bg-gray-700 rounded-md" />
                    <button onClick={handleFinalSubmit} disabled={isLoading} className="w-full bg-[#F57921] text-white font-bold py-3 rounded-md hover:bg-opacity-90 disabled:opacity-50">
                        {isLoading ? <i className="fas fa-spinner fa-spin"></i> : "Enviar para Verificación"}
                    </button>
                </div>
            )}
            
            {feedback && <p className="mt-4 text-center text-yellow-300 bg-yellow-900/50 p-3 rounded-md">{feedback}</p>}

            <button onClick={onLogout} className="text-gray-500 hover:text-red-400 mt-8 text-sm mx-auto block">Cerrar sesión</button>
        </div>
    );
};











