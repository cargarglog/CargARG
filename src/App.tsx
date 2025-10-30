import React, { useState, useEffect, useRef, Suspense } from 'react';
import { User, UserRole, Load, Plan, Location, LoadStatus, PlaceLocation } from './types';
import Navbar from './components/Header';
import Dashboard from './components/Dashboard';
import LandingPage from './components/LoadList';
// add Suspense to existing React import
const VerifyAccountPage = React.lazy(() => import('./components/ChatBot').then(m => ({ default: m.VerifyAccountPage })));
const VerifyIdPage = React.lazy(() => import('./components/ChatBot').then(m => ({ default: m.VerifyIdPage })));
const PostLoadPage = React.lazy(() => import('./components/ChatBot').then(m => ({ default: m.PostLoadPage })));
const LoadDetailsPage = React.lazy(() => import('./components/ChatBot').then(m => ({ default: m.LoadDetailsPage })));
const PlansPage = React.lazy(() => import('./components/ChatBot').then(m => ({ default: m.PlansPage })));
const PendingVerificationPage = React.lazy(() => import('./components/ChatBot').then(m => ({ default: m.PendingVerificationPage })));
import LoginPage from './components/LoginPage';
import StaffDashboard from './components/StaffDashboard';
import { ToastContainer } from './ux/toast';
import { auth, db } from './firebase';
import * as authFirebase from 'firebase/auth';
import * as firestore from 'firebase/firestore';
import { runTransaction } from 'firebase/firestore';

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [loads, setLoads] = useState<Load[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [page, setPage] = useState('landing');
    const [hasVerificationAttempt, setHasVerificationAttempt] = useState(false);
    const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
    const [userLocation, setUserLocation] = useState<Location | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const isRegisteringRef = useRef(false);
    const redirectPendingRef = useRef(false);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Anti-stall: ensure landing renders even if auth/geolocation are slow
    useEffect(() => {
        const t = setTimeout(() => setIsLoading(false), 1500);
        return () => clearTimeout(t);
    }, []);

    // Auto-check email verification status every 3s until verified
    useEffect(() => {
        if (user && !user.emailVerified) {
            const id = setInterval(async () => {
                try {
                    await auth.currentUser?.reload();
                    if (auth.currentUser?.emailVerified) {
                        setUser(prev => prev ? { ...prev, emailVerified: true } : prev);
                    }
                } catch {}
            }, 3000);
            return () => clearInterval(id);
        }
    }, [user?.id, user?.emailVerified]);

    // Gestiona el resultado de signInWithRedirect para Google (si lo hay) y autoprov del perfil
    useEffect(() => {
        (async () => {
            try {
                redirectPendingRef.current = true;
                const result = await authFirebase.getRedirectResult(auth);
                if (result?.user) {
                    const firebaseUser = result.user;
                    const userDocRef = firestore.doc(db, 'users', firebaseUser.uid);
                    // Idempotente: no sobrescribe si ya existe
                    await firestore.setDoc(userDocRef, {
                        uid: firebaseUser.uid,
                        email: (firebaseUser.email || '').toLowerCase().trim(),
                        role: UserRole.DRIVER,
                        companyName: null,
                        perfilEstado: 'pending_attempt1', verificationStatus: 'pending',
                        plan: 'free',
                        createdAt: firestore.serverTimestamp(),
                    }, { merge: true });
                }
            } catch (e) {
                console.warn('[Google Redirect] Error post-redirect:', e);
            } finally {
                // Limpia bandera si se us�
                sessionStorage.removeItem('cargarg:doRedirectResult');
                redirectPendingRef.current = false;
            }
        })();
    }, []);

    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
            () => setUserLocation({ lat: -34.6037, lng: -58.3816 }) // Default to BA
        );

        const unsubscribe = authFirebase.onAuthStateChanged(auth, async (firebaseUser) => {
            // No interrumpir cuando ya hay usuario; solo evitar parpadeo durante registro antes de que Auth establezca la sesi�n
            if (isRegisteringRef.current && !firebaseUser) {
                return;
            }

            if (firebaseUser) {
                const userDocRef = firestore.doc(db, "users", firebaseUser.uid);
                let userDocSnap = await firestore.getDoc(userDocRef);

                // Auto-provisiona documento del usuario si no existe (evita quedarse en login)
                if (!userDocSnap.exists()) {
                    try {
                        await firestore.setDoc(userDocRef, {
                            uid: firebaseUser.uid,
                            email: (firebaseUser.email || '').toLowerCase().trim(),
                            role: UserRole.DRIVER,
                            companyName: null,
                            perfilEstado: 'pending_attempt1', verificationStatus: 'pending',
                            plan: 'free',
                            createdAt: firestore.serverTimestamp(),
                        });
                        userDocSnap = await firestore.getDoc(userDocRef);
                    } catch (e) {
                        console.warn("[Auth] No se pudo crear el doc de usuario:", e);
                    }
                }

                if (userDocSnap.exists()) {
                    const data = userDocSnap.data() as any;
                    const dbUser: User = { 
                        id: firebaseUser.uid,
                        email: data.email,
                        role: data.role,
                        dni: data.dni,
                        companyName: data.companyName,
                        perfilEstado: data.perfilEstado,
                        plan: data.plan,
                        emailVerified: firebaseUser.emailVerified
                    };

                    setUser(dbUser);
                    
                    if (dbUser.role === UserRole.STAFF) {
                        setPage('staffDashboard');
                    } else if (dbUser.emailVerified && dbUser.perfilEstado === 'validada') {
                        await fetchAllData(dbUser);
                        setPage('dashboard');
                    }
                } else {
                    console.warn("[Auth] Usuario autenticado sin documento y no se pudo autoprovisionar.");
                }
            } else {
                setUser(null);
                setLoads([]);
                setAllUsers([]);
                setPage('landing');
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const fetchAllData = async (user: User) => {
        if (user.role === UserRole.STAFF) {
            try {
                const usersSnapshot = await firestore.getDocs(firestore.collection(db, "users"));
                const usersList = usersSnapshot.docs.map(doc => {
                    const data = doc.data() as any;
                    return {
                        id: doc.id,
                        email: data.email,
                        role: data.role,
                        dni: data.dni,
                        companyName: data.companyName,
                        perfilEstado: data.perfilEstado,
                        plan: data.plan,
                        emailVerified: false,
                    } as User;
                });
                setAllUsers(usersList);
            } catch (e) {
                console.warn('[FetchAllData] Lectura de users no permitida:', e);
                setAllUsers([]);
            }
        } else {
            setAllUsers([]);
        }
        
        const mapDocToLoad = (doc: any): Load => {
            const data = doc.data();
        
            const defaultLocation: PlaceLocation = {
                address: 'Ubicaci�n no especificada',
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
                createdAt: (data.createdAt && (data.createdAt as any).toMillis) ? (data.createdAt as any).toMillis() : data.createdAt,
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
            } as Load;
        };

        if (user.role === UserRole.DRIVER) {
            const loadsQuery = firestore.query(
                firestore.collection(db, "loads"),
                firestore.or(
                    firestore.where("status", "==", LoadStatus.AVAILABLE),
                    firestore.where("driverId", "==", user.id)
                )
            );

            const loadsSnapshot = await firestore.getDocs(loadsQuery);
            const loadsList = loadsSnapshot.docs.map(mapDocToLoad);
            setLoads(loadsList.sort((a, b) => b.createdAt - a.createdAt));
            return;
        }

        let loadsQuery;
        if (user.role === UserRole.COMPANY) {
            loadsQuery = firestore.query(
                firestore.collection(db, "loads"),
                firestore.where("companyId", "==", user.id)
            );
        } else {
            loadsQuery = firestore.query(firestore.collection(db, "loads"));
        }
        
        const loadsSnapshot = await firestore.getDocs(loadsQuery);
        const loadsList = loadsSnapshot.docs.map(mapDocToLoad);
        setLoads(loadsList.sort((a, b) => b.createdAt - a.createdAt));
    };

    const handleNavigate = (newPage: string) => {
        window.scrollTo(0, 0);
        setPage(newPage);
    };
    
    const handleLogin = async (email: string, password: string) => {
        console.log(`[Login] Intento de inicio de sesi�n para ${email}.`);
        return authFirebase.signInWithEmailAndPassword(auth, email, password);
    };
    
    const handleRegister = async (email: string, password: string, role: UserRole, companyName?: string) => {
        isRegisteringRef.current = true;
        let userCredential: authFirebase.UserCredential | undefined;
        try {
            userCredential = await authFirebase.createUserWithEmailAndPassword(auth, email, password);
            const firebaseUser = userCredential.user;
            const uid = firebaseUser.uid;
    
            const firestoreData = {
                uid: uid,
                email: (email || '').toLowerCase().trim(),
                role,
                companyName: companyName || null,
                perfilEstado: 'pending_attempt1', verificationStatus: 'pending' as const,
                plan: 'free' as const,
                createdAt: firestore.serverTimestamp(),
            };

            // Crear documento del usuario de forma idempotente (evita duplicados si hay condiciones de carrera)
            await runTransaction(db, async (tx) => {
                const ref = firestore.doc(db, "users", uid);
                const snap = await tx.get(ref);
                if (!snap.exists()) {
                    tx.set(ref, firestoreData);
                }
            });
    
            await authFirebase.sendEmailVerification(firebaseUser);

            const newUser: User = {
                id: uid,
                email,
                role,
                companyName: companyName || '',
                perfilEstado: 'pending_attempt1', verificationStatus: 'pending',
                plan: 'free',
                emailVerified: firebaseUser.emailVerified,
            };
            setUser(newUser);
    
        } catch (error: any) {
            console.error("[Registro] Error durante el registro:", error);
            
            if (userCredential) {
                console.warn("[Registro] Error post-auth. Limpiando usuario de Auth...");
                await authFirebase.deleteUser(userCredential.user);
            }
            
            if (error.code === 'auth/email-already-in-use') {
                throw new Error("Este correo electr�nico ya est� en uso.");
            }
            throw new Error("Ocurri� un error durante el registro. Por favor, intenta de nuevo.");
        } finally {
            isRegisteringRef.current = false;
        }
    };

    const handleGoogleSignIn = async () => {
        const provider = new authFirebase.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true;
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (isStandalone || isMobile) {
                sessionStorage.setItem('cargarg:doRedirectResult', '1');
                await authFirebase.signInWithRedirect(auth, provider);
                return;
            }

            const result = await authFirebase.signInWithPopup(auth, provider);
            const firebaseUser = result.user;

            const userDocRef = firestore.doc(db, "users", firebaseUser.uid);
            const userDocSnap = await firestore.getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                console.log("[Google Sign-In] Nuevo usuario. Creando documento en Firestore.");
                const firestoreData = {
                    uid: firebaseUser.uid,
                    email: (firebaseUser.email || '').toLowerCase().trim(),
                    role: UserRole.DRIVER,
                    companyName: null,
                    perfilEstado: 'pending_attempt1', verificationStatus: 'pending' as const,
                    plan: 'free' as const,
                    createdAt: firestore.serverTimestamp(),
                };
                await runTransaction(db, async (tx) => {
                    const snap = await tx.get(userDocRef);
                    if (!snap.exists()) {
                        tx.set(userDocRef, firestoreData);
                    }
                });
            }
        } catch (error: any) {
            if (
                error?.code === 'auth/operation-not-supported-in-this-environment' ||
                error?.code === 'auth/popup-blocked' ||
                error?.code === 'auth/cancelled-popup-request'
            ) {
                sessionStorage.setItem('cargarg:doRedirectResult', '1');
                await authFirebase.signInWithRedirect(auth, provider);
                return;
            }
            console.error("[Google Sign-In] Error:", error?.code, error?.message);
            throw error;
        }
    };


    const handleLogout = async () => {
        await authFirebase.signOut(auth);
    };

    const handleSelectLoad = (load: Load) => {
        setSelectedLoad(load);
        handleNavigate('loadDetails');
    };

    const handleAddLoad = async (newLoadData: Omit<Load, 'id' | 'createdAt'>) => {
        if (!user) return;
        const rootRef = firestore.doc(firestore.collection(db, "loads"));
        await firestore.setDoc(rootRef, {
            ...newLoadData,
            companyId: user.id,
            createdAt: firestore.serverTimestamp(),
        } as any);
        if (user) await fetchAllData(user);
        handleNavigate('dashboard');
    };
    
    const handleAcceptLoad = async (load: Load) => {
        if (!user || user.role !== UserRole.DRIVER) return;
        const loadDocRef = firestore.doc(db, 'loads', load.id);
        await firestore.updateDoc(loadDocRef, { status: LoadStatus.IN_PROGRESS, driverId: user.id });
        await fetchAllData(user);
        handleNavigate('dashboard');
    };
    
    const handleCompleteLoad = async (load: Load, podUrl: string, rating: number) => {
        const loadDocRef = firestore.doc(db, 'loads', load.id);
        await firestore.updateDoc(loadDocRef, { status: LoadStatus.COMPLETED, companyRating: rating });
        if (user) await fetchAllData(user);
        handleNavigate('dashboard');
    };
    
    const handleResendVerification = async () => {
        if (auth.currentUser) {
            try {
                await authFirebase.sendEmailVerification(auth.currentUser);
                console.log("[Verificaci�n] Correo reenviado ?");
                alert("Se ha reenviado el correo de verificaci�n.");
            } catch (error) {
                console.error("[Verificaci�n] Error al reenviar correo:", error);
                alert("Hubo un error al reenviar el correo.");
            }
        }
    };
    
    const handleCheckVerification = async () => {
       if (!auth.currentUser) return;
       await auth.currentUser.reload();
       if (auth.currentUser.emailVerified && user && !user.emailVerified) {
           console.log("[Verificaci�n] Email verificado ?");
           setUser(prevUser => ({ ...prevUser!, emailVerified: true }));
       } else {
           console.log("[Verificaci�n] Email no verificado ?");
       }
    };
    
    const handleIdentitySubmitted = (dni: string, finalState: 'pending_attempt1' | 'pending_attempt2' | 'pending_selfie' | 'pending_review' | 'validada' | 'rechazada') => {
        if (user) {
            setUser({ ...user, perfilEstado: finalState, dni });
        }
    };

    const handleUpgradePlan = async (plan: Plan) => {
        if (!user) return;
        const userDocRef = firestore.doc(db, 'users', user.id);
        await firestore.updateDoc(userDocRef, { plan });
        setUser({ ...user, plan });
        handleNavigate('dashboard');
        alert(`Plan actualizado a ${plan}!`);
    };

    const renderPage = () => {
        if (isLoading && user) {
            return (
                <div className="flex justify-center items-center h-screen">
                    <div className="inline-block w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" aria-label="loading" />
                </div>
            );
        }

        if (!user) {
            return page === 'login' 
                ? <LoginPage onLogin={handleLogin} onRegister={handleRegister} onNavigate={handleNavigate} onGoogleSignIn={handleGoogleSignIn} />
                : <LandingPage onNavigate={handleNavigate} user={user} />;
        }
        
        if (user.role === UserRole.STAFF) {
            return <StaffDashboard user={user} />;
        }
        
        if (!user.emailVerified) {
            return <Suspense fallback={<div className="flex justify-center items-center h-[60vh]"><div className="inline-block w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" aria-label="loading" /></div>}><VerifyAccountPage 
                email={user.email} 
                onCheckVerification={handleCheckVerification}
                onResendVerification={handleResendVerification}
                onLogout={handleLogout}
            /></Suspense>;
        }
        
        if (user.perfilEstado !== 'validada') {
            if (user.perfilEstado === 'pending_review') {
                return <Suspense fallback={<div className="flex justify-center items-center h-[60vh]"><div className="inline-block w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" aria-label="loading" /></div>}><PendingVerificationPage onLogout={handleLogout} /></Suspense>;
            }
            return <Suspense fallback={<div className="flex justify-center items-center h-[60vh]"><div className="inline-block w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" aria-label="loading" /></div>}><VerifyIdPage user={user} onIdentitySubmitted={handleIdentitySubmitted} onLogout={handleLogout} /></Suspense>;
        }
        
        switch(page) {
            case 'dashboard':
                return <Dashboard user={user} allUsers={allUsers} loads={loads} onSelectLoad={handleSelectLoad} onNavigate={handleNavigate} userLocation={userLocation} />;
            case 'loadDetails':
                return selectedLoad ? <Suspense fallback={<div className="flex justify-center items-center h-[60vh]"><div className="inline-block w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" aria-label="loading" /></div>}><LoadDetailsPage load={selectedLoad} user={user} onBack={() => handleNavigate('dashboard')} onAcceptLoad={handleAcceptLoad} onCompleteLoad={handleCompleteLoad} userLocation={userLocation} /></Suspense> : <p>Carga no encontrada. Vuelve al panel.</p>;
            case 'postLoad':
                return <Suspense fallback={<div className="flex justify-center items-center h-[60vh]"><div className="inline-block w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" aria-label="loading" /></div>}><PostLoadPage user={user} onAddLoad={handleAddLoad} onBack={() => handleNavigate('dashboard')} /></Suspense>;
            case 'plans':
                return <Suspense fallback={<div className="flex justify-center items-center h-[60vh]"><div className="inline-block w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" aria-label="loading" /></div>}><PlansPage user={user} onBack={() => handleNavigate('dashboard')} onUpgradePlan={handleUpgradePlan} /></Suspense>;
            default:
                return <Dashboard user={user} allUsers={allUsers} loads={loads} onSelectLoad={handleSelectLoad} onNavigate={handleNavigate} userLocation={userLocation} />;
        }
    }
    
    return (
        <div className="bg-gray-900 min-h-screen text-white font-sans">
            {!isOnline && (
                <div className="bg-yellow-500 text-black text-center p-2 font-semibold fixed top-0 w-full z-[100]">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Est�s desconectado. La funcionalidad puede ser limitada.
                </div>
            )}
            <Navbar user={user} onNavigate={handleNavigate} onLogout={handleLogout} isOnline={isOnline} />
            <main>
                {renderPage()}
            </main>
            <ToastContainer />
        </div>
    );
}

export default App;




