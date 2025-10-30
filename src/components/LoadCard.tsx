import React from 'react';
import { Load, LoadStatus, UserRole } from '../types';

const formatPrice = (price: number, currency: 'ARS' | 'USD' | 'BRL' = 'ARS') => {
    return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : currency === 'USD' ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(price);
};

const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
    <div className="flex items-center justify-start">
        {[...Array(5)].map((_, i) => (
            <i key={i} className={`fas fa-star text-sm ${i < rating ? 'text-yellow-400' : 'text-gray-600'}`}></i>
        ))}
    </div>
);

const LoadCard: React.FC<{
    load: Load;
    onSelect: (load: Load) => void;
    userRole: UserRole;
    distance?: number | null;
}> = ({ load, onSelect, userRole, distance }) => (
    <div 
        className="bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden cursor-pointer"
        onClick={() => onSelect(load)}
    >
        <div className="p-5 border-l-4 border-transparent hover:border-[#F57921]">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-bold text-blue-400">Carga #{load.id.substring(0,6)}</h3>
                    <p className="text-sm text-gray-400">por {load.company}</p>
                </div>
                 <div className="text-right">
                    <span className="text-lg font-semibold text-green-400">{formatPrice(load.price, load.currency || 'ARS')}</span>
                    {load.status === LoadStatus.COMPLETED && (
                        <p className="text-xs font-bold text-green-300 bg-green-900/50 px-2 py-1 rounded-full inline-block mt-1">COMPLETADO</p>
                    )}
                     {load.status === LoadStatus.IN_PROGRESS && (
                        <p className="text-xs font-bold text-blue-300 bg-blue-900/50 px-2 py-1 rounded-full inline-block mt-1">EN CURSO</p>
                    )}
                </div>
            </div>
            <div className="flex items-start">
                <div className="flex flex-col items-center mr-4">
                    <i className="fas fa-map-marker-alt text-gray-500"></i>
                    <div className="w-px h-12 bg-gray-600 my-1"></div>
                    <i className="fas fa-flag-checkered text-[#F57921]"></i>
                </div>
                <div className="flex-grow">
                    <div>
                        <p className="font-semibold text-gray-200">{load.startLocation.address}</p>
                        {userRole === UserRole.DRIVER && load.status === LoadStatus.AVAILABLE && (
                            <>
                                {distance === undefined && (
                                    <p className="text-xs text-gray-500 animate-pulse mt-1">Calculando distancia...</p>
                                )}
                                {distance != null && (
                                    <p className="text-xs text-blue-400 font-semibold mt-1">
                                        <i className="fas fa-route mr-1"></i>
                                        {Math.round(distance)} km de tu ubicación
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                    <div className="mt-2"><p className="font-semibold text-gray-200">{load.endLocation.address}</p></div>
                </div>
                 {load.status !== LoadStatus.COMPLETED && <div className="self-end"><button className="bg-brand-600 text-white font-bold py-2 px-4 rounded-md hover:bg-brand-500 transition-colors">Detalles</button></div>}
            </div>
            {load.status === LoadStatus.COMPLETED && (
                <div className="border-t border-gray-700 mt-4 pt-3 text-xs flex justify-around">
                    <div className="text-center">
                        <p className="font-semibold text-gray-400">Tu Calificación</p>
                        <StarRating rating={userRole === UserRole.DRIVER ? load.companyRating ?? 0 : load.driverRating ?? 0} />
                    </div>
                    <div className="text-center">
                        <p className="font-semibold text-gray-400">Calificación Recibida</p>
                        <StarRating rating={userRole === UserRole.DRIVER ? load.driverRating ?? 0 : load.companyRating ?? 0} />
                    </div>
                </div>
            )}
        </div>
    </div>
);

export default LoadCard;
