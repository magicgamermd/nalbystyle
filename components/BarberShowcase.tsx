import React from 'react';
import { Barber, Language } from '../types';
import { t } from '../utils/translations';

interface BarberShowcaseProps {
  barbers: Barber[];
  onBookBarber: (barberId: string) => void;
  lang: Language;
}

export const BarberShowcase: React.FC<BarberShowcaseProps> = ({ barbers, onBookBarber, lang }) => {
  const T = t[lang].barbers;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="text-center mb-16">
        <h2 className="text-gold-500 text-sm uppercase tracking-[0.3em] mb-4">{T.team}</h2>
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white mb-6">{T.title}</h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
            {T.subtitle}
        </p>
      </div>

      <div className="grid gap-12">
        {barbers.map((barber, index) => (
          <div 
            key={barber.id} 
            className={`flex flex-col md:flex-row gap-8 items-center ${index % 2 === 1 ? 'md:flex-row-reverse' : ''} bg-dark-800/30 p-8 rounded-xl border border-white/5 hover:border-gold-500/30 transition duration-500`}
          >
            <div className="w-full md:w-1/3 shrink-0">
               <div className="aspect-square relative rounded-lg overflow-hidden border-2 border-gold-500/20 shadow-2xl">
                 <img src={barber.avatar} alt={barber.name} className="w-full h-full object-cover transition-transform duration-700 hover:scale-110" />
               </div>
            </div>
            <div className="w-full md:w-2/3 text-center md:text-left">
               <div className="flex flex-col md:flex-row justify-between items-center mb-4">
                  <h3 className="text-3xl font-display text-white mb-2 md:mb-0">{lang === 'bg' ? barber.nameBg : barber.name}</h3>
                  <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-gold-500/20">
                      <i className="fa-solid fa-star text-gold-500 text-xs"></i>
                      <span className="text-gold-100 font-bold text-sm">{barber.rating} / 5.0</span>
                  </div>
               </div>
               <h4 className="text-gold-500 uppercase tracking-widest text-sm mb-6">{lang === 'bg' ? barber.specialtyBg : barber.specialty}</h4>
               <p className="text-gray-300 leading-relaxed mb-8 text-lg font-light">
                   {lang === 'bg' ? barber.bioBg : barber.bio}
               </p>
               <button 
                  onClick={() => onBookBarber(barber.id)}
                  className="inline-block border border-gold-500 text-gold-500 px-8 py-3 rounded hover:bg-gold-500 hover:text-black font-bold transition duration-300"
               >
                   {T.bookBtn} {(lang === 'bg' ? barber.nameBg : barber.name).split(' ')[0]}
               </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};