import React, { useRef, useState } from 'react';
import { showToast } from '../ux/toast';
import { UserRole } from '../types';

interface LoginPageProps {
    onLogin: (email: string, pass: string) => Promise<any>;
    onRegister: (email: string, pass: string, role: UserRole, companyName?: string) => Promise<any>;
    onNavigate: (page: string) => void;
    onGoogleSignIn: (role: UserRole, companyName?: string) => Promise<void>;
    onLogout: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onRegister, onNavigate, onGoogleSignIn, onLogout }) => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState<UserRole>(UserRole.DRIVER);
    const [companyName, setCompanyName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const submittingRef = useRef(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submittingRef.current) return;
        submittingRef.current = true;
        setError('');
        setLoading(true);

        try {
            if (isLoginView) {
                await onLogin(email, password);
                // The onAuthStateChanged listener in App.tsx will handle navigation
            } else {
                if (role === UserRole.COMPANY && !companyName) {
                    throw new Error("El nombre de la empresa es obligatorio.");
                }
                await onRegister(email, password, role, companyName);
                showToast('Registro exitoso. Revisa tu correo para verificar tu cuenta.', 'success');
                // onAuthStateChanged will now handle redirecting to the verification page
            }
        } catch (err: any) {
            if (err.message.includes("auth/invalid-credential")) {
                setError("Correo o contraseña incorrectos.");
            } else if (err.message.includes("auth/email-already-in-use")) {
                setError("Este correo electrónico ya está en uso.");
            } else {
                setError(err.message || "Ocurrió un error. Por favor, intenta de nuevo.");
            }
        } finally {
            setLoading(false);
            submittingRef.current = false;
        }
    };
    
    const handleGoogleSignIn = async () => {
        if (submittingRef.current) return;
        submittingRef.current = true;
        setError('');
        setLoading(true);
        try {
            await onGoogleSignIn(role, companyName || undefined);
            // onAuthStateChanged will handle navigation on success
        } catch (error: any) {
            let errorMessage = "Error al iniciar sesión con Google. Intenta de nuevo.";
            switch (error.code) {
                case 'auth/popup-closed-by-user':
                    // This is not an error, the user just closed the window.
                    setLoading(false);
                    return;
                case 'auth/operation-not-allowed':
                    errorMessage = "El inicio de sesión con Google no está habilitado. Contacta al soporte.";
                    break;
                case 'auth/popup-blocked':
                    errorMessage = "El navegador bloqueó la ventana de inicio de sesión. Por favor, habilita las ventanas emergentes.";
                    break;
                case 'auth/account-exists-with-different-credential':
                    errorMessage = "Ya existe una cuenta con este correo, pero con una contraseña. Intenta iniciar sesión con tu contraseña.";
                    break;
            }
            setError(errorMessage);
        } finally {
            // Only set loading to false if it's not a success case, 
            // because on success, the page will redirect.
            setLoading(false);
            submittingRef.current = false;
        }
    };

    return (
        <div className="max-w-md mx-auto mt-10 mb-10 p-8 bg-gray-800 rounded-lg shadow-xl">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight">
                    <span className="text-white">Carg</span><span className="text-brand-500">ARG</span>
                </h1>
                <p className="text-gray-400 mt-2">{isLoginView ? 'Inicia sesión para continuar' : 'Crea una cuenta nueva'}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && <p className="bg-red-900/50 text-red-300 p-3 rounded-md text-center">{error}</p>}

                {!isLoginView && (
                     <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Soy un</label>
                        <div className="flex gap-4">
                            <button type="button" onClick={() => setRole(UserRole.DRIVER)} className={`flex-1 p-3 rounded-md font-semibold text-center transition ${role === UserRole.DRIVER ? 'bg-[#00529B] text-white' : 'bg-gray-700 text-gray-300'}`}>
                                <i className="fas fa-truck mr-2"></i>Conductor
                            </button>
                            <button type="button" onClick={() => setRole(UserRole.COMPANY)} className={`flex-1 p-3 rounded-md font-semibold text-center transition ${role === UserRole.COMPANY ? 'bg-[#00529B] text-white' : 'bg-gray-700 text-gray-300'}`}>
                                <i className="fas fa-building mr-2"></i>Logistica
                            </button>
                        </div>
                    </div>
                )}
                
                <InputField id="email" type="email" label="Correo Electrónico" value={email} onChange={setEmail} required />
                
                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-400">Contraseña</label>
                    <div className="relative mt-1">
                        <input 
                            id="password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={6}
                            className="w-full p-3 border border-gray-600 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#F57921]"
                        />
                        <button 
                            type="button" 
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-200"
                            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        >
                            <i className={`fas ${showPassword ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                        </button>
                    </div>
                </div>

                {!isLoginView && role === UserRole.COMPANY && (
                    <InputField id="companyName" type="text" label="Nombre de la Empresa" value={companyName} onChange={setCompanyName} required />
                )}

                <button type="submit" disabled={loading} className="w-full bg-brand-600 text-white font-bold py-3 rounded-md hover:bg-brand-500 transition-all disabled:bg-gray-500 flex items-center justify-center">
                    {loading && <i className="fas fa-spinner fa-spin mr-2"></i>}
                    {isLoginView ? 'Iniciar Sesión' : 'Registrarse'}
                </button>
                {isLoginView && (
                    <button
                        type="button"
                        onClick={async () => { try { await onLogout(); } finally { onNavigate('landing'); } }}
                        className="w-full mt-3 bg-gray-700 text-white font-semibold py-3 rounded-md hover:bg-gray-600 transition-all"
                    >
                        Cerrar sesiA3n
                    </button>
                )}
            </form>

            <div className="my-6 flex items-center">
                <div className="flex-grow border-t border-gray-600"></div>
                <span className="flex-shrink mx-4 text-gray-400 text-sm">O</span>
                <div className="flex-grow border-t border-gray-600"></div>
            </div>

            <button onClick={handleGoogleSignIn} disabled={loading} className="w-full bg-gray-700 text-white font-bold py-3 rounded-md hover:bg-gray-600 transition-all disabled:bg-gray-500 flex items-center justify-center">
                 <svg className="w-5 h-5 mr-2" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"></path>
                    <path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"></path>
                    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c5.891 0 10.954 4.168 11.838 9.695H24v8h19.839c.193 1.121.302 2.28.302 3.485c0 11.045-8.955 20-20 20z"></path>
                    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.574l6.19 5.238C41.383 35.618 44 30.298 44 24c0-1.341-.138-2.65-.389-3.917z"></path>
                </svg>
                Continuar con Google
            </button>

            <div className="text-center mt-6">
                <button onClick={() => setIsLoginView(!isLoginView)} className="text-blue-400 hover:underline text-sm">
                    {isLoginView ? '¿No tienes una cuenta? Regístrate' : '¿Ya tienes una cuenta? Inicia sesión'}
                </button>
            </div>
        </div>
    );
};

interface InputFieldProps {
    id: string;
    type: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    minLength?: number;
}

const InputField: React.FC<InputFieldProps> = ({ id, type, label, value, onChange, ...props }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-400">{label}</label>
        <input 
            id={id}
            name={id}
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            {...props}
            className="mt-1 w-full p-3 border border-gray-600 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#F57921]"
        />
    </div>
);

export default LoginPage;
