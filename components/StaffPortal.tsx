import React, { useState, useMemo, useRef } from 'react';
import { AppState, Barber, Appointment, Language } from '../types';
import { TIME_SLOTS } from '../constants';
import { t } from '../utils/translations';
import { Modal } from './Modal';

interface StaffPortalProps {
    state: AppState;
    onBook: (appt: Appointment) => void;
    onDeleteAppointment: (id: string) => void;
    onReturnHome: () => void;
    lang: Language;
    authenticatedBarber?: Barber | null; // QR code auto-login barber
    brandName: string;
    logoUrl?: string;
}

type Tab = 'schedule' | 'dashboard';

export const StaffPortal: React.FC<StaffPortalProps> = ({ state, onBook, onDeleteAppointment, onReturnHome, lang = 'en', authenticatedBarber, brandName, logoUrl }) => {
    const [currentUser, setCurrentUser] = useState<Barber | null>(authenticatedBarber || null);
    const [activeTab, setActiveTab] = useState<Tab>('schedule');
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // Ref for the date input to programmatically open it
    const dateInputRef = useRef<HTMLInputElement>(null);

    // Modal State for Booking
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalSlot, setModalSlot] = useState<string | null>(null);
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [serviceId, setServiceId] = useState('');

    // Modal State for Cancellation
    const [cancelModal, setCancelModal] = useState<{ isOpen: boolean; appId: string | null }>({
        isOpen: false,
        appId: null
    });

    const T = t[lang]?.staff || t['en'].staff;

    // --- Statistics Calculation ---
    const stats = useMemo(() => {
        if (!currentUser) return { revenue: 0, appointments: 0, topService: 'N/A', nextAppt: null };

        let rev = 0;
        let count = 0;
        const serviceCounts: Record<string, number> = {};
        const now = new Date();
        let nextAppt: Appointment | null = null;
        let minDiff = Infinity;

        state.appointments.forEach(apt => {
            if (apt.barberId === currentUser.id) {
                count++;
                const s = state.services.find(s => s.id === apt.serviceId);
                if (s && typeof s.price === 'number') {
                    rev += s.price;
                }
                if (s) {
                    const sName = lang === 'bg' ? s.nameBg : s.name;
                    serviceCounts[sName] = (serviceCounts[sName] || 0) + 1;
                }

                // Find next appointment
                const aptDate = new Date(apt.date);
                const diff = aptDate.getTime() - now.getTime();
                if (diff > 0 && diff < minDiff) {
                    minDiff = diff;
                    nextAppt = apt;
                }
            }
        });

        // Find top service
        let topS = 'N/A';
        let max = 0;
        Object.entries(serviceCounts).forEach(([name, c]) => {
            if (c > max) {
                max = c;
                topS = name;
            }
        });

        return { revenue: rev, appointments: count, topService: topS, nextAppt };
    }, [state.appointments, currentUser, lang, state.services]);

    // --- Helpers ---
    // --- Helpers ---
    const getAppointmentForSlot = (time: string) => {
        const targetDate = new Date(`${selectedDate}T${time}`);
        return state.appointments.find(apt => {
            if (apt.barberId !== currentUser?.id) return false;
            // Ignore cancelled appointments so the slot appears free
            if (apt.status === 'cancelled') return false;

            const aptDate = new Date(apt.date);
            return aptDate.getDate() === targetDate.getDate() &&
                aptDate.getMonth() === targetDate.getMonth() &&
                aptDate.getFullYear() === targetDate.getFullYear() &&
                aptDate.getHours() === targetDate.getHours() &&
                aptDate.getMinutes() === targetDate.getMinutes();
        });
    };

    const handleManualBooking = () => {
        if (!modalSlot || !clientName || !serviceId || !currentUser) return;
        const dateTime = new Date(`${selectedDate}T${modalSlot}`);
        const newAppt: Appointment = {
            id: `apt-${Date.now()}`,
            serviceId: serviceId,
            barberId: currentUser.id,
            date: dateTime.toISOString(),
            customerName: clientName,
            customerEmail: clientPhone ? `+359${clientPhone.replace(/\D/g, '')}` : 'walk-in@manual.com', // Use phone as identifier if provided
            status: 'confirmed'
        };
        onBook(newAppt);
        closeModal();
    };

    const openModal = (slot: string) => {
        setModalSlot(slot);
        setServiceId(state.services[0].id);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setModalSlot(null);
        setClientName('');
        setClientPhone('');
    };

    const initiateCancel = (appId: string) => {
        setCancelModal({ isOpen: true, appId });
    };

    const confirmCancel = () => {
        if (cancelModal.appId) {
            onDeleteAppointment(cancelModal.appId);
        }
        setCancelModal({ isOpen: false, appId: null });
    };

    const formatDateDisplay = (dateStr: string) => {
        const d = new Date(dateStr);
        const dayName = d.toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-US', { weekday: 'short' });
        const dayNum = d.getDate();
        const month = d.toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-US', { month: 'short' });
        return { dayName, dayNum, month };
    };

    // --- Login View ---
    if (!currentUser) {
        return (
            <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
                {/* Background Atmosphere */}
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/dark-leather.png')] opacity-20"></div>
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-gold-500/10 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-900/10 rounded-full blur-3xl"></div>

                <div className="z-10 w-full max-w-md animate-fade-in-up">
                    <div className="text-center mb-10">
                        <img src={logoUrl || "/images/nalby-logo.png"} alt={brandName} className="w-32 h-32 mx-auto mb-6 object-contain opacity-90 drop-shadow-2xl" />
                        <h1 className="font-display text-4xl text-white mb-2 tracking-widest">{brandName}</h1>
                        <p className="text-gold-500/80 text-sm uppercase tracking-widest border-b border-gold-500/20 pb-4 inline-block">{T.portal}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {state.barbers.map(barber => (
                            <button
                                key={barber.id}
                                onClick={() => setCurrentUser(barber)}
                                className="group relative bg-dark-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6 flex flex-col items-center gap-3 hover:border-gold-500 hover:bg-dark-800 transition-all duration-300 shadow-xl"
                            >
                                <div className="relative">
                                    <img src={barber.avatar} alt={barber.name} className="w-20 h-20 rounded-full object-cover border-2 border-gray-600 group-hover:border-gold-500 transition-colors" />
                                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-dark-800 rounded-full"></div>
                                </div>
                                <div className="text-center">
                                    <h3 className="font-bold text-white text-sm leading-tight group-hover:text-gold-400 transition-colors">
                                        {(lang === 'bg' ? barber.nameBg : barber.name).split('"')[0]}
                                    </h3>
                                    <p className="text-[10px] text-gray-500 uppercase mt-1">Select Profile</p>
                                </div>
                            </button>
                        ))}
                    </div>

                    <button onClick={onReturnHome} className="mt-12 text-gray-500 text-xs w-full text-center hover:text-white uppercase tracking-wider flex items-center justify-center gap-2 transition-colors">
                        <i className="fa-solid fa-arrow-left"></i> {t[lang]?.nav?.backToWeb || "Back to Website"}
                    </button>
                </div>
            </div>
        );
    }

    // --- Main App Layout ---
    return (
        <div className="min-h-screen bg-black pb-24 text-gray-200 font-body">
            {/* Header */}
            <header className="bg-dark-900/90 backdrop-blur-md border-b border-gray-800 pt-12 pb-4 px-6 sticky top-0 z-30 shadow-lg">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <img src={currentUser.avatar} className="w-10 h-10 rounded-full border border-gold-500 object-cover" />
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-dark-900 rounded-full"></div>
                        </div>
                        <div>
                            <h2 className="text-xs text-gold-500 uppercase tracking-wider">Welcome back</h2>
                            <h1 className="font-bold text-white leading-none">{(lang === 'bg' ? currentUser.nameBg : currentUser.name).split(' ')[0]}</h1>
                        </div>
                    </div>
                    <button
                        onClick={() => setCurrentUser(null)}
                        className="w-8 h-8 rounded-full bg-dark-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-dark-700 transition"
                    >
                        <i className="fa-solid fa-power-off text-xs"></i>
                    </button>
                </div>
            </header>

            {/* Top Navigation Pills */}
            <div className="bg-dark-900 px-6 py-4 border-b border-gray-800/50 sticky top-0 z-30">
                <div className="flex items-center gap-2 bg-dark-800/60 rounded-full p-1.5 max-w-md mx-auto backdrop-blur-sm border border-gray-700/50">
                    <button
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full font-bold text-sm transition-all duration-300 ${activeTab === 'schedule'
                            ? 'bg-gradient-to-r from-gold-600 to-gold-500 text-black shadow-lg shadow-gold-500/30 scale-105'
                            : 'text-gray-400 hover:text-white hover:bg-dark-700/50'
                            }`}
                        onClick={() => setActiveTab('schedule')}
                    >
                        <i className="fa-solid fa-calendar-days"></i>
                        <span className="uppercase tracking-wide">{T.schedule}</span>
                    </button>
                    <button
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full font-bold text-sm transition-all duration-300 ${activeTab === 'dashboard'
                            ? 'bg-gradient-to-r from-gold-600 to-gold-500 text-black shadow-lg shadow-gold-500/30 scale-105'
                            : 'text-gray-400 hover:text-white hover:bg-dark-700/50'
                            }`}
                        onClick={() => setActiveTab('dashboard')}
                    >
                        <i className="fa-solid fa-chart-pie"></i>
                        <span className="uppercase tracking-wide">{T.myStats}</span>
                    </button>
                </div>
            </div>

            {/* DASHBOARD TAB */}
            {activeTab === 'dashboard' && (
                <div className="p-6 space-y-6 animate-fade-in">
                    {/* Overview Cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gradient-to-br from-dark-800 to-dark-900 p-5 rounded-2xl border border-gray-800 shadow-lg">
                            <div className="flex items-center gap-2 mb-2 text-gold-500">
                                <i className="fa-solid fa-sack-dollar"></i>
                                <span className="text-xs font-bold uppercase">{T.totalRevenue}</span>
                            </div>
                            <div className="text-2xl font-bold text-white">€{stats.revenue}</div>
                            <div className="text-xs text-gray-500 mt-1">This month</div>
                        </div>
                        <div className="bg-gradient-to-br from-dark-800 to-dark-900 p-5 rounded-2xl border border-gray-800 shadow-lg">
                            <div className="flex items-center gap-2 mb-2 text-blue-400">
                                <i className="fa-solid fa-calendar-check"></i>
                                <span className="text-xs font-bold uppercase">{T.totalAppts}</span>
                            </div>
                            <div className="text-2xl font-bold text-white">{stats.appointments}</div>
                            <div className="text-xs text-gray-500 mt-1">Confirmed</div>
                        </div>
                    </div>

                    {/* Performance Goal */}
                    <div className="bg-dark-800 p-5 rounded-2xl border border-gray-800">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-sm font-bold text-white">Weekly Goal</span>
                            <span className="text-xs text-gold-500">€{stats.revenue} / €2000</span>
                        </div>
                        <div className="w-full bg-dark-900 rounded-full h-2">
                            <div
                                className="bg-gradient-to-r from-gold-600 to-gold-400 h-2 rounded-full"
                                style={{ width: `${Math.min((stats.revenue / 2000) * 100, 100)}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Next Appointment Snippet */}
                    {stats.nextAppt ? (
                        <div className="bg-gradient-to-r from-dark-800 to-dark-700 p-5 rounded-2xl border-l-4 border-green-500 shadow-lg">
                            <h3 className="text-xs text-gray-400 uppercase mb-2">Up Next</h3>
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="text-lg font-bold text-white">{stats.nextAppt.customerName}</div>
                                    <div className="text-sm text-gold-400">
                                        {new Date(stats.nextAppt.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                                <div className="w-10 h-10 bg-dark-900 rounded-full flex items-center justify-center">
                                    <i className="fa-solid fa-scissors text-gray-400"></i>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-dark-800 p-6 rounded-2xl text-center border border-dashed border-gray-700">
                            <p className="text-gray-500 text-sm">No upcoming appointments found.</p>
                        </div>
                    )}

                    <div className="bg-dark-800 p-5 rounded-2xl border border-gray-800">
                        <h3 className="text-xs text-gray-400 uppercase mb-3">{T.topService}</h3>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded bg-gold-500/20 flex items-center justify-center text-gold-500">
                                <i className="fa-solid fa-star"></i>
                            </div>
                            <span className="font-bold text-white">{stats.topService}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* SCHEDULE TAB */}
            {activeTab === 'schedule' && (
                <div className="animate-fade-in">
                    {/* Modern Date Picker */}
                    <div className="bg-dark-900 py-4 border-b border-gray-800 sticky top-24 z-20 shadow-md">
                        <div className="flex items-center justify-between px-6">
                            <button
                                onClick={() => {
                                    const d = new Date(selectedDate);
                                    d.setDate(d.getDate() - 1);
                                    setSelectedDate(d.toISOString().split('T')[0]);
                                }}
                                className="w-10 h-10 shrink-0 rounded-full bg-dark-800 flex items-center justify-center text-gray-400 hover:text-white"
                            >
                                <i className="fa-solid fa-chevron-left"></i>
                            </button>

                            {/* EXPANDED HIT AREA */}
                            <div
                                className="flex-1 mx-4 relative group flex flex-col items-center justify-center cursor-pointer py-2 hover:bg-dark-800/30 rounded-lg transition-colors"
                                onClick={() => {
                                    try {
                                        dateInputRef.current?.showPicker();
                                    } catch (err) {
                                        // Fallback or ignore
                                    }
                                }}
                            >
                                <div className="text-center pointer-events-none">
                                    <div className="text-xs text-gold-500 uppercase font-bold tracking-widest group-hover:text-gold-400 transition-colors mb-1">
                                        {formatDateDisplay(selectedDate).month} <i className="fa-solid fa-caret-down ml-1"></i>
                                    </div>
                                    <div className="text-3xl font-display font-bold text-white group-hover:text-gray-200 transition-colors leading-none">
                                        {formatDateDisplay(selectedDate).dayName} <span className="text-gold-500">.</span> {formatDateDisplay(selectedDate).dayNum}
                                    </div>
                                </div>
                                {/* Hidden native date input for quick access, covering full area */}
                                <input
                                    ref={dateInputRef}
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                />
                            </div>

                            <button
                                onClick={() => {
                                    const d = new Date(selectedDate);
                                    d.setDate(d.getDate() + 1);
                                    setSelectedDate(d.toISOString().split('T')[0]);
                                }}
                                className="w-10 h-10 shrink-0 rounded-full bg-dark-800 flex items-center justify-center text-gray-400 hover:text-white"
                            >
                                <i className="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>

                    {/* Timeline View */}
                    <div className="p-6 relative">
                        {/* Vertical Connector Line */}
                        <div className="absolute left-[85px] top-6 bottom-6 w-0.5 bg-gray-800"></div>

                        <div className="space-y-6">
                            {TIME_SLOTS.map(slot => {
                                const appointment = getAppointmentForSlot(slot);
                                const service = appointment ? state.services.find(s => s.id === appointment.serviceId) : null;

                                return (
                                    <div key={slot} className="flex gap-6 relative">
                                        {/* Time Column */}
                                        <div className="w-12 pt-3 text-right">
                                            <span className="text-sm font-bold text-gray-500 font-mono">{slot}</span>
                                        </div>

                                        {/* Slot Content */}
                                        <div className="flex-1">
                                            {/* Timeline Dot */}
                                            <div className={`absolute left-[56px] top-4 w-3 h-3 rounded-full border-2 ${appointment ? 'bg-gold-500 border-gold-500 shadow-[0_0_10px_rgba(212,175,55,0.5)]' : 'bg-dark-900 border-gray-600'} z-10`}></div>

                                            {appointment ? (
                                                <div className="bg-dark-800 rounded-xl p-4 border border-gray-700 shadow-lg relative overflow-hidden group">
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-gold-500"></div>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className="font-bold text-white text-lg">{appointment.customerName}</h4>
                                                        <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
                                                            <i className="fa-solid fa-user text-gray-400 text-xs"></i>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-xs font-bold text-gold-400 uppercase tracking-wide">{lang === 'bg' ? service?.nameBg : service?.name}</span>
                                                        <span className="text-gray-600">•</span>
                                                        <span className="text-xs text-gray-400">{service?.duration} min</span>
                                                    </div>

                                                    <div className="flex justify-between items-center pt-3 border-t border-gray-700/50">
                                                        <span className="text-xs text-gray-500">{appointment.customerEmail}</span>
                                                        <button
                                                            onClick={() => initiateCancel(appointment.id)}
                                                            className="text-red-400 hover:text-red-300 text-xs uppercase font-bold tracking-wider"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => openModal(slot)}
                                                    className="w-full h-[80px] rounded-xl border border-dashed border-gray-800 bg-dark-900/50 hover:bg-dark-800 hover:border-gold-500/30 transition-all group flex items-center justify-center gap-3"
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-dark-800 border border-gray-700 flex items-center justify-center group-hover:bg-gold-500 group-hover:text-black transition-colors">
                                                        <i className="fa-solid fa-plus text-sm text-gray-500 group-hover:text-black"></i>
                                                    </div>
                                                    <span className="text-sm text-gray-600 font-bold group-hover:text-gold-500">{T.addBooking}</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Manual Booking Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
                    <div className="bg-dark-800 w-full max-w-sm rounded-2xl border border-gold-500/20 shadow-2xl overflow-hidden">
                        <div className="bg-gradient-to-r from-dark-900 to-dark-800 p-5 border-b border-gray-700 flex justify-between items-center">
                            <div>
                                <h3 className="text-white font-bold text-lg">{T.newBooking}</h3>
                                <p className="text-gold-500 text-xs font-mono">{selectedDate} @ {modalSlot}</p>
                            </div>
                            <button onClick={closeModal} className="w-8 h-8 bg-dark-700 rounded-full flex items-center justify-center text-gray-400 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-gray-500 text-xs uppercase font-bold tracking-wider mb-2">{T.clientName}</label>
                                <input
                                    type="text"
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    className="w-full bg-dark-900 border border-gray-700 rounded-lg p-3 text-white focus:border-gold-500 outline-none transition-colors"
                                    placeholder={lang === 'bg' ? "Име на клиента" : "Customer Name"}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-gray-500 text-xs uppercase font-bold tracking-wider mb-2">
                                    {lang === 'bg' ? "Телефон" : "Phone"} <span className="text-gray-600 normal-case italic">({lang === 'bg' ? "Опционално" : "Optional"})</span>
                                </label>
                                <input
                                    type="tel"
                                    value={clientPhone}
                                    onChange={(e) => setClientPhone(e.target.value)}
                                    className="w-full bg-dark-900 border border-gray-700 rounded-lg p-3 text-white focus:border-gold-500 outline-none transition-colors font-mono"
                                    placeholder="+359..."
                                />
                            </div>
                            <div>
                                <label className="block text-gray-500 text-xs uppercase font-bold tracking-wider mb-2">{t[lang]?.admin?.table?.service || "Service"}</label>
                                <div className="relative">
                                    <select
                                        value={serviceId}
                                        onChange={(e) => setServiceId(e.target.value)}
                                        className="w-full bg-dark-900 border border-gray-700 rounded-lg p-3 text-white focus:border-gold-500 outline-none appearance-none"
                                    >
                                        {state.services.map(s => (
                                            <option key={s.id} value={s.id}>{lang === 'bg' ? s.nameBg : s.name} - €{s.price}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-3.5 text-gray-500 pointer-events-none">
                                        <i className="fa-solid fa-chevron-down text-xs"></i>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleManualBooking}
                                disabled={!clientName}
                                className="w-full bg-gold-500 text-black font-bold py-3.5 rounded-lg hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20 disabled:opacity-50 disabled:shadow-none mt-2"
                            >
                                {T.confirmBooking}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reusable Custom Modal for Cancellation */}
            <Modal
                isOpen={cancelModal.isOpen}
                title="Confirm Cancellation"
                message={T.cancelConfirm}
                onConfirm={confirmCancel}
                onCancel={() => setCancelModal({ isOpen: false, appId: null })}
                confirmText="Yes, Cancel"
                cancelText="No, Keep It"
            />


        </div>
    );
};
