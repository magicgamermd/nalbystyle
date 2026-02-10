import React, { useState } from 'react';
import { AppState, Service, Barber, Appointment, Language } from '../types';
import { TIME_SLOTS } from '../constants';
import { t } from '../utils/translations';
import { Modal } from './Modal';
import { isSlotAvailable, findNextAvailableSlot } from '../services/bookingManager';

interface BookingWizardProps {
  state: AppState;
  onBook: (appt: Appointment) => void;
  lang: Language;
}

export const BookingWizard: React.FC<BookingWizardProps> = ({ state, onBook, lang }) => {
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; type: 'alert' | 'confirm' }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert'
  });

  const T = t[lang].booking;

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  const showAlert = (title: string, message: string) => {
    setModalState({ isOpen: true, title, message, type: 'alert' });
  };

  const handleSubmit = () => {
    if (!selectedService || !selectedBarber || !selectedDate || !selectedTime || !customerName) return;

    // Construct ISO date from inputs
    const dateTime = new Date(`${selectedDate}T${selectedTime}`);

    const newAppt: Appointment = {
      id: `apt-${Date.now()}`,
      serviceId: selectedService,
      barberId: selectedBarber,
      date: dateTime.toISOString(),
      customerName,
      customerEmail: `+359${customerPhone}`,
      status: 'pending'
    };

    onBook(newAppt);
    showAlert("Success", T.alertSent);
  };

  const getStepTitle = () => {
    switch (step) {
      case 1: return T.step1;
      case 2: return T.step2;
      case 3: return T.step3;
      case 4: return T.step4;
      default: return "";
    }
  };

  // Check availability using shared utility
  const checkSlotAvailability = (time: string, dateToCheck: string) => {
    return isSlotAvailable(time, dateToCheck, selectedBarber!, state.appointments);
  };

  // Function to find the next available slot automatically
  const handleFindNextAvailable = () => {
    if (!selectedBarber) return;
    // Fix: Correct argument order (assignments, barbers, barberId)
    const nextSlot = findNextAvailableSlot(state.appointments, state.barbers, selectedBarber);

    if (nextSlot) {
      setSelectedDate(nextSlot.date);
      setSelectedTime(nextSlot.time); // Auto-select the time clearly
    } else {
      showAlert("Info", T.noSlotsFound);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Modal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        onConfirm={() => setModalState(prev => ({ ...prev, isOpen: false }))}
        type={modalState.type}
      />

      {/* Progress Bar */}
      <div className="flex justify-between items-center mb-10 relative">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-dark-700 -z-10"></div>
        {[1, 2, 3, 4].map(num => (
          <div key={num} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 transition-colors duration-300 ${step >= num ? 'bg-gold-500 border-gold-500 text-black' : 'bg-dark-900 border-gray-600 text-gray-500'}`}>
            {num}
          </div>
        ))}
      </div>

      <div className="bg-dark-800 p-8 rounded-xl border border-gold-500/20 shadow-2xl min-h-[400px] flex flex-col">
        <h2 className="text-3xl font-display text-white mb-6 text-center">{getStepTitle()}</h2>

        <div className="flex-1">
          {/* STEP 1: SERVICES */}
          {step === 1 && (
            <div className="grid md:grid-cols-2 gap-4">
              {state.services.map(service => (
                <button
                  key={service.id}
                  onClick={() => setSelectedService(service.id)}
                  className={`p-4 rounded-lg border text-left transition-all flex items-center gap-4 ${selectedService === service.id
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-gray-700 bg-dark-700 hover:bg-dark-600'
                    }`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 overflow-hidden ${selectedService === service.id ? 'bg-gold-500 text-black' : 'bg-black text-gold-500 border border-gold-500/30'}`}>
                    {service.imageUrl ? (
                      <img src={service.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <i className={service.icon}></i>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-white text-lg">{lang === 'bg' ? service.nameBg : service.name}</span>
                      <span className="text-gold-400 font-bold">{typeof service.price === 'number' ? `€${service.price}` : service.price}</span>
                    </div>
                    <p className="text-gray-400 text-sm line-clamp-2">{lang === 'bg' ? service.descriptionBg : service.description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* STEP 2: BARBERS */}
          {step === 2 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {state.barbers.map(barber => (
                <button
                  key={barber.id}
                  onClick={() => setSelectedBarber(barber.id)}
                  className={`p-4 rounded-lg border transition-all flex flex-col items-center gap-4 ${selectedBarber === barber.id
                    ? 'border-gold-500 bg-gold-500/10 scale-105'
                    : 'border-gray-700 bg-dark-700 hover:bg-dark-600'
                    }`}
                >
                  <img src={barber.avatar} alt={barber.name} className="w-20 h-20 rounded-full object-cover border-2 border-gold-500/50" />
                  <div className="text-center">
                    <h3 className="font-bold text-white text-base">{lang === 'bg' ? barber.nameBg : barber.name}</h3>
                    <p className="text-gold-400 text-xs uppercase tracking-wide mt-1">{lang === 'bg' ? barber.specialtyBg : barber.specialty}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* STEP 3: DATE & TIME */}
          {step === 3 && (
            <div className="flex flex-col md:flex-row gap-8">
              <div className="flex-1">
                <div className="mb-4">
                  <label className="block text-gray-300 mb-2">{T.selectDate}</label>
                  <input
                    type="date"
                    className="w-full bg-dark-700 border border-gray-600 rounded p-3 text-white focus:border-gold-500 focus:outline-none mb-2"
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setSelectedTime(null);
                    }}
                    value={selectedDate}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <button
                    onClick={handleFindNextAvailable}
                    className="w-full py-3 bg-dark-800 border border-gold-500/30 text-gold-500 hover:bg-gold-500 hover:text-black font-bold rounded transition-colors flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-calendar-check"></i>
                    {T.findNextSlot}
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-gray-300 mb-2">{T.availableSlots}</label>
                {!selectedDate ? (
                  <p className="text-gray-500 text-sm italic">{T.plsSelectDate}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {TIME_SLOTS.map(time => {
                      const available = checkSlotAvailability(time, selectedDate);
                      return (
                        <button
                          key={time}
                          onClick={() => available && setSelectedTime(time)}
                          disabled={!available}
                          className={`py-2 rounded text-sm font-bold border transition-colors ${selectedTime === time
                            ? 'bg-gold-500 text-black border-gold-500'
                            : available
                              ? 'bg-dark-700 text-white border-gray-600 hover:border-gray-400'
                              : 'bg-dark-900 text-gray-600 border-dark-800 cursor-not-allowed opacity-50 decoration-dashed line-through'
                            }`}
                        >
                          {time}
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedDate && <p className="mt-2 text-xs text-gray-500">{T.showingAvailability} <span className="text-gold-400">{lang === 'bg' ? state.barbers.find(b => b.id === selectedBarber)?.nameBg : state.barbers.find(b => b.id === selectedBarber)?.name}</span></p>}
              </div>
            </div>
          )}

          {/* STEP 4: DETAILS */}
          {step === 4 && (
            <div className="max-w-md mx-auto space-y-6">
              <div>
                <label className="block text-gray-400 mb-1 text-sm">{T.fullName}</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-dark-900 border border-gray-700 rounded p-3 text-white focus:border-gold-500 focus:outline-none"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1 text-sm">{T.phone || 'Phone'}</label>
                <div className="flex items-center">
                  <span className="bg-dark-800 border border-r-0 border-gray-700 rounded-l p-3 text-gray-400 font-mono">+359</span>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, ''); // Only digits
                      if (value.length <= 9) setCustomerPhone(value);
                    }}
                    className="flex-1 bg-dark-900 border border-gray-700 rounded-r p-3 text-white focus:border-gold-500 focus:outline-none"
                    placeholder="87 123 4567"
                    maxLength={9}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Въведете 9 цифри след +359</p>
              </div>

              <div className="bg-dark-900/50 p-4 rounded border border-gray-700 mt-6">
                <h4 className="text-gold-500 font-bold mb-2 uppercase text-xs tracking-wider">{T.summary}</h4>
                <div className="flex justify-between text-sm text-gray-300 mb-1">
                  <span>{T.service}:</span>
                  <span className="text-white">{lang === 'bg' ? state.services.find(s => s.id === selectedService)?.nameBg : state.services.find(s => s.id === selectedService)?.name}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-300 mb-1">
                  <span>{T.barber}:</span>
                  <span className="text-white">{lang === 'bg' ? state.barbers.find(b => b.id === selectedBarber)?.nameBg : state.barbers.find(b => b.id === selectedBarber)?.name}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-300">
                  <span>{T.time}:</span>
                  <span className="text-white">{selectedDate} @ {selectedTime}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-700">
          <button
            onClick={prevStep}
            disabled={step === 1}
            className={`px-6 py-2 rounded font-bold text-gray-400 hover:text-white transition ${step === 1 ? 'opacity-0' : ''}`}
          >
            {T.back}
          </button>

          {step < 4 ? (
            <button
              onClick={nextStep}
              disabled={
                (step === 1 && !selectedService) ||
                (step === 2 && !selectedBarber) ||
                (step === 3 && (!selectedDate || !selectedTime))
              }
              className="px-8 py-2 bg-white text-black font-bold rounded hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {T.next}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!customerName || customerPhone.length !== 9}
              className="px-8 py-2 bg-gold-500 text-black font-bold rounded hover:bg-gold-400 transition shadow-[0_0_15px_rgba(212,175,55,0.4)] disabled:opacity-50"
            >
              {T.confirm}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};