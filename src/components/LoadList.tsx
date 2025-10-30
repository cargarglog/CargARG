import React from 'react';
import { User, Plan } from '../types';

interface LandingPageProps {
  onNavigate: (page: string) => void;
  user: User | null; // Added user prop
}

const FeatureCard: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="bg-gray-800 p-6 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 transform hover:-translate-y-1">
        <div className="flex items-center mb-3">
            <i className={`fas ${icon} text-2xl text-brand-500 mr-4`}></i>
            <h3 className="text-xl font-bold text-brand-400">{title}</h3>
        </div>
        <p className="text-gray-400">{children}</p>
    </div>
);

const PlanCard: React.FC<{ title: string; price: string; features: string[]; primary?: boolean; planType: Plan; onSelectPlan: (plan: Plan) => void; currentUserPlan?: Plan; }> = ({ title, price, features, primary = false, planType, onSelectPlan, currentUserPlan }) => {
    const isCurrentPlan = currentUserPlan === planType;
    
    const planOrder: Plan[] = ['free', 'silver', 'gold'];
    const currentUserPlanIndex = currentUserPlan ? planOrder.indexOf(currentUserPlan) : -1;
    const planTypeIndex = planOrder.indexOf(planType);
    const cannotUpgrade = !!currentUserPlan && planTypeIndex <= currentUserPlanIndex;


    return (
        <div className={`border rounded-lg p-8 flex flex-col ${primary ? 'bg-gray-900 text-white border-gray-700 transform scale-105 shadow-2xl' : 'bg-gray-800 text-gray-300 border-gray-700'}`}>
            <h3 className={`text-2xl font-bold ${primary ? 'text-white' : 'text-brand-400'}`}>{title}</h3>
            <p className={`text-4xl font-extrabold my-4 ${primary ? 'text-gray-100' : 'text-gray-100'}`}>{price}</p>
            <ul className={`space-y-3 mb-8 ${primary ? '' : 'text-gray-400'}`}>
                {features.map((feature, i) => {
                     if (feature.startsWith('HEADING:')) {
                        return <li key={i} className={`font-semibold pt-2 ${primary ? 'text-white' : 'text-gray-200'}`}>{feature.replace('HEADING:', '')}</li>;
                    }
                    return (
                        <li key={i} className="flex items-start">
                            <i className={`fas fa-check-circle mr-3 mt-1 flex-shrink-0 ${primary ? 'text-green-300' : 'text-green-400'}`}></i>
                            <span>{feature}</span>
                        </li>
                    );
                })}
            </ul>
            <button 
                onClick={() => onSelectPlan(planType)} 
                disabled={cannotUpgrade}
                className={`mt-auto font-bold py-3 px-6 rounded-md transition-colors 
                    ${primary ? 'bg-brand-600 text-white hover:bg-brand-500' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}
                    ${(cannotUpgrade) ? 'opacity-50 cursor-not-allowed' : ''}
                `}
            >
                {isCurrentPlan ? 'Plan Actual' : (cannotUpgrade ? 'Plan Actual o Superior' : 'Seleccionar Plan')}
            </button>
        </div>
    );
};


const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, user }) => {

    const handlePlanSelection = (planType: Plan) => {
        if (!user) {
            alert('Por favor, inicia sesión para seleccionar un plan.');
            onNavigate('login');
        } else {
            onNavigate('plans'); // Navigate to the plans page where the actual selection/purchase happens
        }
    };

  return (
    <div className="bg-gray-900">
      {/* Hero Section */}
      <section className="bg-cover bg-center text-white py-20 md:py-32" style={{backgroundImage: "linear-gradient(rgba(136, 24, 24, 0.85), rgba(17, 24, 39, 0.9)), url('https://images.unsplash.com/photo-1587293852325-3b1f0c36b30b?q=80&w=2070&auto=format&fit=crop')"}}>
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4">Conectamos cargas con destinos.</h1>
          <p className="text-xl md:text-2xl font-light mb-8 max-w-3xl mx-auto">La plataforma inteligente que digitaliza el transporte, uniendo empresas y transportistas. Rápido, seguro y global.</p>
          <button onClick={() => onNavigate('login')} className="bg-brand-600 text-white font-bold py-3 px-8 rounded-full text-lg hover:bg-brand-500 transition-all duration-300 transform hover:scale-105 shadow-lg">
            ¡Comienza Ahora!
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-100 mb-12">Beneficios de la Plataforma CargARG</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard icon="fa-shield-alt" title="Seguridad Garantizada">
                Verificación de empresas y transportistas, seguimiento en tiempo real y sistema de calificaciones.
            </FeatureCard>
            <FeatureCard icon="fa-bolt" title="Eficiencia Máxima">
                Reduce tiempos muertos, optimiza rutas y conecta cargas de retorno para maximizar la rentabilidad.
            </FeatureCard>
            <FeatureCard icon="fa-network-wired" title="Red Extensa">
                Accede a miles de empresas y transportistas verificados en toda América Latina.
            </FeatureCard>
            <FeatureCard icon="fa-brain" title="IA Avanzada">
                Tecnología de punta que aprende de cada operación para ofrecer recomendaciones personalizadas.
            </FeatureCard>
          </div>
        </div>
      </section>
      
      {/* Pricing Section */}
      <section className="py-16 bg-gray-800">
        <div className="max-w-7xl mx-auto px-4">
            <div className="mb-20">
                <h2 className="text-3xl font-bold text-center text-gray-100 mb-12">Para Conductores</h2>
                <div className="grid md:grid-cols-2 gap-8 items-start max-w-4xl mx-auto">
                    <PlanCard 
                        title="FREE" 
                        price="Gratis" 
                        features={[
                            "5 asignaciones mensuales",
                            "Rango de operación a la redonda: 150 km",
                            "Emparejamiento mediado por IA",
                            "Chat con IA (coordinación básica)",
                            "Identidad verificada",
                            "Sin costo de ingreso",
                        ]} 
                        planType="free" 
                        onSelectPlan={handlePlanSelection} 
                        currentUserPlan={user?.plan} 
                    />
                    <PlanCard 
                        title="SILVER" 
                        price="USD 20/mes" 
                        features={[
                            "20 asignaciones mensuales",
                            "Rango de operación a la redonda: 250 km",
                            "GPS con IA predictiva",
                            "Chat con IA (coordinación básica)",
                            "Identidad verificada",
                            "Filtros según camión/remolque",
                            "HEADING:Plan Mixto (+ USD 5):",
                            "20 asignaciones + 20 publicaciones propias",
                            "Publicaciones destacadas en listas",
                        ]} 
                        primary 
                        planType="silver" 
                        onSelectPlan={handlePlanSelection} 
                        currentUserPlan={user?.plan} 
                    />
                </div>
            </div>

            <div>
                <h2 className="text-3xl font-bold text-center text-gray-100 mb-12">Para Empresas de Logística</h2>
                <div className="grid md:grid-cols-2 gap-8 items-start max-w-4xl mx-auto">
                    <PlanCard 
                        title="FREE" 
                        price="Gratis" 
                        features={[
                            "15 publicaciones mensuales",
                            "Emparejamiento mediado por IA",
                            "Chat con IA (coordinación básica)",
                            "Identidad verificada del responsable",
                            "Sin costo de ingreso",
                        ]} 
                        planType="free" 
                        onSelectPlan={handlePlanSelection} 
                        currentUserPlan={user?.plan} 
                    />
                    <PlanCard 
                        title="SILVER" 
                        price="USD 20/mes" 
                        features={[
                            "50 publicaciones mensuales",
                            "Emparejamiento con camiones verificados mediante IA",
                            "Chat con IA (coordinación básica)",
                            "Identidad verificada del responsable",
                            "Publicaciones destacadas en listas",
                            "Incrementa +10 publicaciones por +USD 10",
                        ]} 
                        primary 
                        planType="silver" 
                        onSelectPlan={handlePlanSelection} 
                        currentUserPlan={user?.plan} 
                    />
                </div>
            </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-charcoal-900 text-white text-center py-6">
        <p><span className="font-semibold"><span>Carg</span><span className="text-brand-500">ARG</span></span> &copy; 2025 - Conectamos cargas con destinos. En segundos.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
