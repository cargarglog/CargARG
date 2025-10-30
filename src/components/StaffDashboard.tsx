import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { db, storage as storageClient } from '../firebase';
import * as firestore from 'firebase/firestore';
import * as storage from 'firebase/storage';
import { User, EnrichedVerificationRequest, VerificationLog, UserRole, Load, LoadStatus, Plan, PlaceLocation } from '../types';
import LoadCard from './LoadCard';

declare global {
    interface Window {
        google: any;
    }
}

// =================================================================
// Sub-Component: Manual Verification Panel
// =================================================================

const getHttpsUrlFromGsUri = async (gsUri: string): Promise<string> => {
    if (!gsUri.startsWith('gs://')) return '';
    try {
        const storageRef = storage.ref(storageClient, gsUri);
        return await storage.getDownloadURL(storageRef);
    } catch (error) {
        console.error(`Error getting download URL for ${gsUri}:`, error);
        return '';
    }
};

const ImagePreview: React.FC<{ title: string; url: string | null }> = ({ title, url }) => (
    <div className="text-center">
        <p className="font-semibold text-sm mb-2 text-gray-400">{title}</p>
        {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={title} className="w-full h-auto rounded-md object-cover aspect-[4/3] bg-gray-700 cursor-pointer shadow-lg" />
            </a>
        ) : (
            <div className="w-full h-auto rounded-md flex items-center justify-center aspect-[4/3] bg-gray-700 text-gray-500">
                <i className="fas fa-image text-3xl"></i>
            </div>
        )}
    </div>
);

// CargARG Identity Extended Integration
const VerificationRequestCard: React.FC<{
    request: EnrichedVerificationRequest;
    onApprove: (userId: string, logId: string) => void;
    onReject: (userId: string, logId: string, reason: string) => void;
    onRetry: (userId: string, logId: string, components: string[], feedback?: string) => void;
}> = ({ request, onApprove, onReject, onRetry }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [requested, setRequested] = useState<{ [k: string]: boolean }>({
        dni_front: false,
        dni_back: false,
        selfie: false,
        license_front: false,
        license_back: false,
    });

    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            alert('Por favor, proporciona un motivo para el rechazo.');
            return;
        }
        setIsProcessing(true);
        await onReject(request.user.id, request.log.id, rejectionReason);
        setIsProcessing(false);
    };

    const handleApprove = async () => {
        setIsProcessing(true);
        await onApprove(request.user.id, request.log.id);
        setIsProcessing(false);
    };
    const handleRetry = async () => {
        setIsProcessing(true);
        const comps = Object.entries(requested).filter(([, v]) => v).map(([k]) => k);
        await onRetry(request.user.id, request.log.id, comps, rejectionReason);
        setIsProcessing(false);
    };
    
    const { user, log, imageUrls } = request;
    const score = log.facialSimilarityScore ? (log.facialSimilarityScore * 100).toFixed(2) : 'N/A';
    const scoreColor = log.facialSimilarityScore && log.facialSimilarityScore >= 0.72 ? 'text-green-400' : 'text-yellow-400';

    return (
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left p-4 flex justify-between items-center bg-gray-700/50 hover:bg-gray-700 transition-colors">
                <div>
                    <p className="font-bold text-lg text-white">{user.email}</p>
                    <p className="text-sm text-gray-400">DNI: {log.userSubmittedDni || 'No especificado'} - Intento #{log.attemptNumber + 1}</p>
                    <p className="text-xs text-gray-500">Proveedor: {log.provider || 'IA'} · Score: {typeof log.confidenceScore === 'number' ? Math.round(log.confidenceScore * 100) : 'N/A'}%</p>
                </div>
                <div className="flex items-center gap-4">
                     <span className={`text-sm font-semibold ${log.finalState === 'pending_manual' ? 'text-yellow-400' : 'text-gray-500'}`}>{log.finalState}</span>
                     <i className={`fas fa-chevron-down text-xl transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
                </div>
            </button>
            {isOpen && (
                <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h4 className="font-bold text-gray-300 border-b border-gray-600 pb-2">Documentos del Usuario</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <ImagePreview title="Selfie" url={imageUrls.selfie} />
                            <ImagePreview title="DNI (Frente)" url={imageUrls.dniFront} />
                            {imageUrls.dniBack && <ImagePreview title="DNI (Dorso)" url={imageUrls.dniBack} />}
                            {imageUrls.licenseFront && <ImagePreview title="Licencia (Frente)" url={imageUrls.licenseFront} />}
                            {imageUrls.licenseBack && <ImagePreview title="Licencia (Dorso)" url={imageUrls.licenseBack} />}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="font-bold text-gray-300 border-b border-gray-600 pb-2">Análisis de IA y Acciones</h4>
                        <div className="bg-gray-900/50 p-4 rounded-md space-y-3">
                            <div><p className="font-semibold text-blue-400">Puntuación de Similitud Facial:</p><p className={`text-2xl font-bold ${scoreColor}`}>{score}%</p></div>
                            <div><p className="font-semibold text-blue-400">Resultado de Document AI:</p><p className={`text-sm ${log.documentVerification?.success ? 'text-green-400' : 'text-red-400'}`}>{log.documentVerification?.reason || "No disponible"}</p></div>
                            <div><p className="font-semibold text-blue-400">Razón del Fallo Automático:</p><p className="text-sm text-yellow-400">{log.errorMessage || "No se registró un error específico."}</p></div>
                        </div>
                        <div className="space-y-3 pt-2">
                             <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Motivo del rechazo o instrucciones para reintento (visible para el usuario)..." className="w-full p-2 border border-gray-600 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#F57921]" rows={2}/>
                             <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
                                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={requested.dni_front} onChange={(e)=>setRequested(p=>({...p,dni_front:e.target.checked}))}/> DNI Frente</label>
                                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={requested.dni_back} onChange={(e)=>setRequested(p=>({...p,dni_back:e.target.checked}))}/> DNI Dorso</label>
                                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={requested.selfie} onChange={(e)=>setRequested(p=>({...p,selfie:e.target.checked}))}/> Selfie</label>
                                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={requested.license_front} onChange={(e)=>setRequested(p=>({...p,license_front:e.target.checked}))}/> Licencia Frente</label>
                                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={requested.license_back} onChange={(e)=>setRequested(p=>({...p,license_back:e.target.checked}))}/> Licencia Dorso</label>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={handleReject} disabled={isProcessing} className="flex-1 bg-red-600 text-white font-bold py-2 px-4 rounded-md hover:bg-red-700 disabled:bg-red-900 transition-colors">
                                    {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : "Rechazar"}
                                </button>
                                <button onClick={handleRetry} disabled={isProcessing} className="flex-1 bg-yellow-600 text-white font-bold py-2 px-4 rounded-md hover:bg-yellow-700 disabled:bg-yellow-900 transition-colors">
                                    {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : "Solicitar Reintento"}
                                </button>
                                <button onClick={handleApprove} disabled={isProcessing} className="flex-1 bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-green-900 transition-colors">
                                    {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : "Aprobar"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const ManualVerificationPanel: React.FC<{ staffUser: User }> = ({ staffUser }) => {
    const [requests, setRequests] = useState<EnrichedVerificationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Filtros — Integración de verificación extendida
    const [filterText, setFilterText] = useState('');
    const [filterAttempt, setFilterAttempt] = useState<number | ''>('');

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const usersQuery = firestore.query(firestore.collection(db, 'users'), firestore.where('perfilEstado', '==', 'pending_review'));
            const usersSnapshot = await firestore.getDocs(usersQuery);
            const pendingUsers: User[] = usersSnapshot.docs.map(doc => {
                const data = doc.data() as any;
                return {
                    id: doc.id,
                    email: data.email,
                    role: data.role,
                    dni: data.dni,
                    companyName: data.companyName,
                    emailVerified: data.emailVerified || false,
                    perfilEstado: data.perfilEstado,
                    plan: data.plan,
                } as User;
            });

            const enrichedRequests = await Promise.all(
                pendingUsers.map(async (user) => {
                    const logsQuery = firestore.query(
                        firestore.collection(db, 'identity_verification_logs', user.id, 'attempts'),
                        firestore.orderBy('createdAt', 'desc'),
                        firestore.limit(1)
                    );
                    let logsSnapshot = await firestore.getDocs(logsQuery);
                    // Fallback legacy: users/{uid}/verification_logs
                    if (logsSnapshot.empty) {
                        const legacyQuery = firestore.query(
                            firestore.collection(db, `users/${user.id}/verification_logs`),
                            firestore.orderBy('createdAt', 'desc'),
                            firestore.limit(1)
                        );
                        logsSnapshot = await firestore.getDocs(legacyQuery);
                        if (logsSnapshot.empty) return null;
                    }

                    const logDoc = logsSnapshot.docs[0];
                    const logData = logDoc.data() as any;
                    const log: VerificationLog = {
                        id: logDoc.id,
                        attemptNumber: logData.attemptNumber,
                        createdAt: logData.createdAt,
                        dniBackUri: logData.dniBackUri,
                        dniFrontUri: logData.dniFrontUri,
                        selfieUri: logData.selfieUri,
                        licenseFrontUri: logData.licenseFrontUri,
                        licenseBackUri: logData.licenseBackUri,
                        errorMessage: logData.errorMessage,
                        facialSimilarityScore: logData.facialSimilarityScore,
                        finalState: logData.finalState,
                        status: logData.status,
                        strategy: logData.strategy,
                        userSubmittedDni: logData.userSubmittedDni,
                        documentVerification: logData.documentVerification,
                        manualVerification: logData.manualVerification
                    };

                    const [selfie, dniFront, dniBack, licenseFront, licenseBack] = await Promise.all([
                        getHttpsUrlFromGsUri(log.selfieUri),
                        getHttpsUrlFromGsUri(log.dniFrontUri),
                        log.dniBackUri ? getHttpsUrlFromGsUri(log.dniBackUri) : Promise.resolve(null),
                        log.licenseFrontUri ? getHttpsUrlFromGsUri(log.licenseFrontUri) : Promise.resolve(null),
                        log.licenseBackUri ? getHttpsUrlFromGsUri(log.licenseBackUri) : Promise.resolve(null),
                    ]);

                    return { user, log, imageUrls: { selfie, dniFront, dniBack, licenseFront, licenseBack } };
                })
            );
            setRequests(enrichedRequests.filter(Boolean) as EnrichedVerificationRequest[]);
        } catch (err) {
            console.error(err);
            setError('Error al cargar las solicitudes de verificación.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);
    
    const handleAction = async (userId: string, logId: string, action: 'approved' | 'rejected', reason?: string) => {
        try {
            // CargARG Identity Extended Integration — DNI uniqueness pre-check via callable
            if (action === 'approved') {
                const logRef = firestore.doc(db, 'identity_verification_logs', userId, 'attempts', logId);
                const logSnap = await firestore.getDoc(logRef);
                const logData: any = logSnap.data() || {};
                const dniNumber = logData.userSubmittedDni || null;
                if (dniNumber) {
                    const { httpsCallable } = await import('firebase/functions');
                    const { functions } = await import('../firebase');
                    const guard = httpsCallable(functions as any, 'guardDniUniqueness');
                    const resp: any = await guard({ dniNumber, uid: userId });
                    if (resp?.data?.conflict) {
                        alert('El DNI pertenece a otro usuario. No se puede aprobar.');
                        return;
                    }
                }
            }
            await firestore.updateDoc(firestore.doc(db, 'users', userId), {
                perfilEstado: action === 'approved' ? 'validada' : 'rechazada',
                verificationStatus: action === 'approved' ? 'verified' : 'banned',
                verificationFeedback: action === 'rejected' ? reason : null,
            });
            const logRef = firestore.doc(db, 'identity_verification_logs', userId, 'attempts', logId);
            const logSnap = await firestore.getDoc(logRef);
            const logData: any = logSnap.data() || {};
            const dniNumber = logData.userSubmittedDni || null;
            await firestore.updateDoc(logRef, {
                manualVerification: { action, reason: reason || null, verifiedBy: staffUser.id, verifiedAt: firestore.serverTimestamp() },
                finalState: action === 'approved' ? 'validada' : 'rechazada',
                status: action === 'approved' ? 'approved' : 'rejected',
                attemptStatus: action === 'approved' ? 'approved' : 'rejected',
                updatedAt: firestore.serverTimestamp(),
            });
            // Integración de verificación extendida: dniRegistry
            if (dniNumber) {
                await firestore.setDoc(firestore.doc(db, 'dniRegistry', String(dniNumber)), {
                    uid: userId,
                    verificationStatus: action === 'approved' ? 'verified' : 'banned',
                    provider: logData.provider || 'Staff',
                    confidenceScore: logData.confidenceScore || null,
                    updatedAt: firestore.serverTimestamp(),
                }, { merge: true });
            }
            setRequests(prev => prev.filter(r => r.user.id !== userId));
        } catch (error) {
            console.error(`Error al ${action === 'approved' ? 'aprobar' : 'rechazar'}`, error);
            alert('Ocurrió un error al procesar la solicitud.');
        }
    };
    
    const handleApprove = (userId: string, logId: string) => handleAction(userId, logId, 'approved');
    const handleReject = (userId: string, logId: string, reason: string) => handleAction(userId, logId, 'rejected', reason);
    const handleRetry = async (userId: string, logId: string, components: string[], feedback?: string) => {
        try {
            await firestore.updateDoc(firestore.doc(db, 'identity_verification_logs', userId, 'attempts', logId), {
                status: 'retry_required',
                requestedComponents: components,
                feedback: feedback || null,
                updatedAt: firestore.serverTimestamp(),
            });
        } catch (e) {
            console.warn('[StaffDashboard] retry update failed', e);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                <h2 className="text-2xl font-bold text-gray-100">Verificaciones Pendientes</h2>
                <button onClick={fetchRequests} disabled={loading} className="font-semibold py-2 px-4 rounded-md transition-all bg-[#00529B] text-white hover:bg-opacity-90 disabled:bg-gray-600">
                    <i className={`fas fa-sync ${loading ? 'fa-spin' : ''} mr-2`}></i>Actualizar
                </button>
            </div>
            {loading && <div className="text-center p-8"><i className="fas fa-spinner fa-spin text-4xl text-blue-400"></i></div>}
            {error && <p className="text-center bg-red-900/50 text-red-300 p-4 rounded-md">{error}</p>}
            {!loading && requests.length === 0 && <p className="text-center text-gray-400 bg-gray-800 p-8 rounded-lg shadow-sm">¡Excelente! No hay verificaciones manuales pendientes.</p>}
            <div className="bg-gray-800 p-4 rounded-lg mb-4 border border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input value={filterText} onChange={e=>setFilterText(e.target.value)} placeholder="Filtrar por DNI/Email/Nombre" className="p-2 bg-gray-700 border border-gray-600 rounded text-white"/>
                <input value={filterAttempt as any} onChange={e=>setFilterAttempt(e.target.value? Number(e.target.value): '')} placeholder="Intento #" type="number" min={1} className="p-2 bg-gray-700 border border-gray-600 rounded text-white"/>
                <button onClick={fetchRequests} disabled={loading} className="p-2 bg-gray-700 border border-gray-600 rounded text-white">Refrescar</button>
              </div>
            </div>
            {(() => {
              const filtered = requests.filter(r => {
                const t = filterText.trim().toLowerCase();
                const okText = !t ||
                  (r.user.email?.toLowerCase().includes(t)) ||
                  (r.log.userSubmittedDni?.toLowerCase?.().includes(t));
                const okAttempt = !filterAttempt || r.log.attemptNumber === filterAttempt;
                return okText && okAttempt;
              });
              return <div className="space-y-4">{filtered.map(req => (
                <VerificationRequestCard key={req.user.id} request={req} onApprove={handleApprove} onReject={handleReject} onRetry={handleRetry}/>
              ))}</div>;
            })()}
        </div>
    );
};


// =================================================================
// Sub-Component: User Management Panel
// =================================================================
const EditUserModal: React.FC<{ user: User; onClose: () => void; onSave: () => void; }> = ({ user, onClose, onSave }) => {
    const [plan, setPlan] = useState<Plan>(user.plan);
    const [perfilEstado, setPerfilEstado] = useState(user.perfilEstado);
    const [companyName, setCompanyName] = useState(user.companyName || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await firestore.updateDoc(firestore.doc(db, 'users', user.id), { plan, perfilEstado, companyName });
            onSave();
        } catch (error) {
            console.error("Error updating user:", error);
            alert("Failed to update user.");
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-2">Editando Usuario</h3>
                <p className="text-blue-300 mb-6">{user.email}</p>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Plan</label>
                        <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)} className="mt-1 w-full p-2 border border-gray-600 bg-gray-700 text-white rounded-md">
                            <option value="free">Free</option>
                            <option value="silver">Silver</option>
                            <option value="gold">Gold</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-300">Estado de Verificación</label>
                        <select value={perfilEstado} onChange={(e) => setPerfilEstado(e.target.value as any)} className="mt-1 w-full p-2 border border-gray-600 bg-gray-700 text-white rounded-md">
                            <option value="sin_verificar">Sin Verificar</option>
                            <option value="pendiente">Pendiente</option>
                            <option value="pendiente_manual">Pendiente (Manual)</option>
                            <option value="validada">Validada</option>
                            <option value="rechazada">Rechazada</option>
                        </select>
                    </div>
                    {user.role === UserRole.COMPANY && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Nombre de Empresa</label>
                            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1 w-full p-2 border border-gray-600 bg-gray-700 text-white rounded-md" />
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-4 mt-8">
                    <button onClick={onClose} className="bg-gray-600 text-white font-bold py-2 px-4 rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving} className="bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-green-800">
                        {isSaving ? <i className="fas fa-spinner fa-spin"></i> : "Guardar Cambios"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const UserManagementPanel: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        const usersSnapshot = await firestore.getDocs(firestore.collection(db, "users"));
        const usersList = usersSnapshot.docs.map(doc => {
            const data = doc.data() as any;
            return {
                id: doc.id,
                email: data.email,
                role: data.role,
                dni: data.dni,
                companyName: data.companyName,
                emailVerified: data.emailVerified || false,
                perfilEstado: data.perfilEstado,
                plan: data.plan,
            } as User;
        });
        setUsers(usersList);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesRole = filterRole === 'all' || user.role === filterRole;
            const matchesSearch = searchTerm === '' || 
                user.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
                (user.companyName && user.companyName.toLowerCase().includes(searchTerm.toLowerCase()));
            return matchesRole && matchesSearch;
        });
    }, [users, searchTerm, filterRole]);
    
    return (
        <div>
            {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSave={() => { setEditingUser(null); fetchUsers(); }} />}
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Gestión de Perfiles</h2>
            <div className="bg-gray-800 p-4 rounded-lg shadow-sm mb-6 flex flex-wrap gap-4">
                <input type="text" placeholder="Buscar por email o empresa..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-grow p-2 border border-gray-600 bg-gray-700 text-white rounded-md"/>
                <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="p-2 border border-gray-600 bg-gray-700 text-white rounded-md">
                    <option value="all">Todos los Roles</option>
                    <option value={UserRole.DRIVER}>Conductores</option>
                    <option value={UserRole.COMPANY}>Empresas</option>
                    <option value={UserRole.STAFF}>Staff</option>
                </select>
            </div>
            <div className="bg-gray-800 rounded-lg shadow-sm overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3">Email / Empresa</th>
                            <th scope="col" className="px-6 py-3">Rol</th>
                            <th scope="col" className="px-6 py-3">Plan</th>
                            <th scope="col" className="px-6 py-3">Verificación</th>
                            <th scope="col" className="px-6 py-3">Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="text-center p-8"><i className="fas fa-spinner fa-spin text-2xl"></i></td></tr>
                        ) : filteredUsers.map(user => (
                            <tr key={user.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                                <td className="px-6 py-4 font-medium text-white">{user.email}{user.companyName && <span className="block text-xs text-gray-400">{user.companyName}</span>}</td>
                                <td className="px-6 py-4 capitalize">{user.role}</td>
                                <td className="px-6 py-4 capitalize">{user.plan}</td>
                                <td className="px-6 py-4"><span className={`px-2 py-1 text-xs rounded-full ${user.perfilEstado === 'validada' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>{user.perfilEstado.replace('_', ' ')}</span></td>
                                <td className="px-6 py-4"><button onClick={() => setEditingUser(user)} className="font-medium text-blue-400 hover:underline">Editar</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// =================================================================
// Sub-Component: All Loads Panel
// =================================================================

const mapDocToLoad = (doc: firestore.QueryDocumentSnapshot): Load => {
    const data = doc.data();

    const defaultLocation: PlaceLocation = {
        address: 'Ubicación no especificada',
        lat: -34.6037,
        lng: -58.3816,
        placeId: ''
    };

    const startLocation = (data.startLocation && typeof data.startLocation.address === 'string')
        ? data.startLocation
        : { ...defaultLocation, address: data.origin || defaultLocation.address };

    const endLocation = (data.endLocation && typeof data.endLocation.address === 'string')
        ? data.endLocation
        : { ...defaultLocation, address: data.destination || defaultLocation.address };
        
    return {
        id: doc.id,
        createdAt: data.createdAt,
        companyId: data.companyId,
        driverId: data.driverId,
        status: data.status,
        startLocation: startLocation,
        endLocation: endLocation,
        price: data.price || 0,
        company: data.company || 'Empresa Desconocida',
        cargoDetails: data.cargoDetails || '',
        requirements: data.requirements || [],
        requiredTruckType: data.requiredTruckType || [],
        paymentDetails: data.paymentDetails || { method: 'transferencia', terms: 'Contra entrega' },
        companyRating: data.companyRating,
        driverRating: data.driverRating,
    };
};


const AllLoadsPanel: React.FC = () => {
    const [loads, setLoads] = useState<Load[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<LoadStatus | 'all'>('all');
    const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
    const mainMapRef = useRef<HTMLDivElement>(null);
    const [isApiLoaded, setIsApiLoaded] = useState(!!window.google);
    
    useEffect(() => {
        const fetchLoads = async () => {
            setLoading(true);
            const loadsQuery = firestore.query(firestore.collection(db, "loads"), firestore.orderBy('createdAt', 'desc'));
            const loadsSnapshot = await firestore.getDocs(loadsQuery);
            const loadsList = loadsSnapshot.docs.map(mapDocToLoad);
            setLoads(loadsList);
            setLoading(false);
        };
        fetchLoads();
    }, []);

    const filteredLoads = useMemo(() => {
        if (activeTab === 'all') return loads;
        return loads.filter(load => load.status === activeTab);
    }, [loads, activeTab]);

     useEffect(() => {
        if (!isApiLoaded) {
             const interval = setInterval(() => { if (window.google) { setIsApiLoaded(true); clearInterval(interval); } }, 100);
             return () => clearInterval(interval);
        }
        if (viewMode !== 'map' || !mainMapRef.current || !isApiLoaded) return;
        
        const map = new window.google.maps.Map(mainMapRef.current, { center: { lat: -34.6037, lng: -58.3816 }, zoom: 4, styles: [{ "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] }, { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] }, { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] }, { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] }, { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] }, { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#263c3f" }] }, { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#6b9a76" }] }, { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }, { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] }, { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9ca5b3" }] }, { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#746855" }] }, { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#1f2835" }] }, { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#f3d19c" }] }, { "featureType": "transit", "elementType": "geometry", "stylers": [{ "color": "#2f3948" }] }, { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] }, { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] }, { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#515c6d" }] }, { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#17263c" }] }] });
        
        const loadsForMap = loads.filter(l => l.status === LoadStatus.AVAILABLE || l.status === LoadStatus.IN_PROGRESS);

        loadsForMap.forEach(load => {
            const startCoords = { lat: load.startLocation.lat, lng: load.startLocation.lng };
            const endCoords = { lat: load.endLocation.lat, lng: load.endLocation.lng };

            new window.google.maps.Marker({ position: startCoords, map, title: `Origen: ${load.startLocation.address}`, icon: "https://maps.google.com/mapfiles/ms/icons/green-dot.png" });
            new window.google.maps.Marker({ position: endCoords, map, title: `Destino: ${load.endLocation.address}`, icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png" });
            if (load.status === LoadStatus.IN_PROGRESS) {
                new window.google.maps.Polyline({ path: [startCoords, endCoords], map, geodesic: true, strokeColor: '#F57921', strokeOpacity: 0.8, strokeWeight: 2 });
            }
        });
    }, [viewMode, filteredLoads, isApiLoaded, loads]);


    const TabButton: React.FC<{ tabId: LoadStatus | 'all', label: string }> = ({ tabId, label }) => (
        <button onClick={() => setActiveTab(tabId)} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === tabId ? 'bg-blue-600 text-white' : 'text-gray-300 bg-gray-700 hover:bg-gray-600'}`}>
            {label}
        </button>
    );

    return (
        <div>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">Todas las Cargas y Viajes</h2>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="flex gap-2">
                    <TabButton tabId="all" label="Todos" />
                    <TabButton tabId={LoadStatus.AVAILABLE} label="Disponibles" />
                    <TabButton tabId={LoadStatus.IN_PROGRESS} label="En Curso" />
                    <TabButton tabId={LoadStatus.COMPLETED} label="Completados" />
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setViewMode('list')} className={`px-4 py-2 rounded-md font-semibold transition-colors ${viewMode === 'list' ? 'bg-[#00529B] text-white' : 'bg-gray-700'}`}><i className="fas fa-list mr-2"></i>Lista</button>
                    <button onClick={() => setViewMode('map')} className={`px-4 py-2 rounded-md font-semibold transition-colors ${viewMode === 'map' ? 'bg-[#00529B] text-white' : 'bg-gray-700'}`}><i className="fas fa-map-marked-alt mr-2"></i>Mapa</button>
                </div>
            </div>
            {loading ? <div className="text-center p-8"><i className="fas fa-spinner fa-spin text-4xl text-blue-400"></i></div> :
             viewMode === 'list' ? (
                <div className="space-y-4">{filteredLoads.map(load => (<LoadCard key={load.id} load={load} onSelect={() => {}} userRole={UserRole.STAFF} />))}</div>
             ) : (
                <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden h-[60vh]">
                    <div ref={mainMapRef} className="w-full h-full" />
                </div>
             )}
        </div>
    );
};


// =================================================================
// Main Staff Dashboard Component
// =================================================================

const StaffDashboard: React.FC<{ user: User }> = ({ user }) => {
    const [view, setView] = useState<'verification' | 'users' | 'loads'>('verification');

    const NavItem: React.FC<{ viewName: typeof view, icon: string, label: string }> = ({ viewName, icon, label }) => (
        <button onClick={() => setView(viewName)} className={`w-full flex items-center p-3 rounded-md text-left transition-colors ${view === viewName ? 'bg-[#00529B] text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
            <i className={`fas ${icon} w-8 text-center text-lg`}></i>
            <span className="font-semibold">{label}</span>
        </button>
    );

    return (
        <div className="flex" style={{ height: 'calc(100vh - 68px)' }}>
            <aside className="w-64 bg-gray-800 p-4 border-r border-gray-700 flex flex-col">
                <h2 className="text-lg font-bold text-gray-400 mb-6 px-2">Panel de Staff</h2>
                <nav className="space-y-2">
                    <NavItem viewName="verification" icon="fa-user-check" label="Verificación Manual" />
                    <NavItem viewName="users" icon="fa-users" label="Perfiles de Usuario" />
                    <NavItem viewName="loads" icon="fa-truck-loading" label="Todas las Cargas" />
                </nav>
            </aside>
            <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gray-900">
                {view === 'verification' && <ManualVerificationPanel staffUser={user} />}
                {view === 'users' && <UserManagementPanel />}
                {view === 'loads' && <AllLoadsPanel />}
            </main>
        </div>
    );
};

export default StaffDashboard;




