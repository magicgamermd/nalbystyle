import React from 'react';
import { Service, Language } from '../types';
import { t } from '../utils/translations';

interface ServiceCatalogProps {
  services: Service[];
  onBookNow: () => void;
  lang: Language;
}

export const ServiceCatalog: React.FC<ServiceCatalogProps> = ({ services, onBookNow, lang }) => {
  const T = t[lang].services;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="text-center mb-20">
        <h2 className="text-gold-500 text-sm uppercase tracking-[0.3em] mb-4">{T.menu}</h2>
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white mb-6">
            {lang === 'bg' ? 'Какво Правим' : 'What We Do'}
        </h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
            {T.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
        {services.map((service, index) => (
          <div key={service.id} className="group flex flex-col items-center text-center p-6 rounded-xl hover:bg-white/5 transition duration-500 border border-transparent hover:border-gold-500/20 cursor-pointer" onClick={onBookNow}>
            
            {/* Icon Container */}
            <div className="mb-6 w-24 h-24 flex items-center justify-center rounded-full border-2 border-gold-500/30 bg-black overflow-hidden group-hover:scale-110 transition duration-500">
                {service.imageUrl ? (
                    <img src={service.imageUrl} alt={service.name} className="w-full h-full object-cover" />
                ) : (
                    <i className={`${service.icon} text-4xl text-gold-500 group-hover:text-gold-400`}></i>
                )}
            </div>

            {/* Service Name & Price */}
            <h3 className="text-xl font-display font-bold text-white mb-2 uppercase tracking-wide">
                {lang === 'bg' ? service.nameBg : service.name}
            </h3>
            
            <div className="text-gold-400 font-bold text-lg mb-4">
                {typeof service.price === 'number' ? `€ ${service.price}` : service.price}
            </div>

            <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
                {lang === 'bg' ? service.descriptionBg : service.description}
            </p>
            
            <button className="mt-6 text-xs text-gray-400 uppercase tracking-widest border-b border-transparent group-hover:border-gold-500 group-hover:text-gold-500 transition-all">
                {T.bookBtn}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};