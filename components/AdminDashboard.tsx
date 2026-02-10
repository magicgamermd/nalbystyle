import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AppState, Barber, Service, Language, Appointment, ShopConfig } from '../types';
import { t } from '../utils/translations';
import { generateServiceIcon, generateServiceDescriptions, generateBarberBio } from '../services/geminiService';
import { uploadImage } from '../services/storage';
import { generateBarberToken } from '../services/db';
import { getConversationLogs, deleteConversationLog, ConversationLog } from '../services/conversationLogService';
import { Modal } from './Modal';
import { INITIAL_SERVICES } from '../constants';
import { ShopSettings } from './ShopSettings';
import { PlanSettings } from './PlanSettings';

interface AdminDashboardProps {
    state: AppState;
    shopId: string;
    shopConfig: ShopConfig | null;
    onSaveShopConfig: (config: ShopConfig) => Promise<void>;
    adminUid?: string | null;
    onAddBarber: (barber: Barber) => void;
    onUpdateBarber: (barber: Barber) => void;
    onDeleteBarber: (id: string) => void;
    onAddService: (service: Service) => void;
    onDeleteAppointment: (id: string) => void;
    onUpdateService: (service: Service) => void;
    lang: Language;
}

const SPECIALTY_OPTIONS = [
    { val: "Head Barber & Stylist", en: "Head Barber & Stylist", bg: "Главен Бръснар & Стилист" },
    { val: "Master Barber", en: "Master Barber", bg: "Майстор Бръснар" },
    { val: "Senior Stylist", en: "Senior Stylist", bg: "Старши Стилист" },
    { val: "Fades & Trends", en: "Fades & Trends", bg: "Фейд & Модерни визии" },
    { val: "Classic Cuts", en: "Classic Cuts", bg: "Класическо подстригване" },
    { val: "Beard Specialist", en: "Beard Specialist", bg: "Специалист Бради" },
    { val: "Grooming Expert", en: "Grooming Expert", bg: "Експерт Грижа" },
    { val: "Colorist", en: "Colorist", bg: "Колорист" },
    { val: "Junior Barber", en: "Junior Barber", bg: "Младши Бръснар" },
    { val: "Shop Manager", en: "Shop Manager", bg: "Мениджър Салон" }
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
    state,
    shopId,
    shopConfig,
    onSaveShopConfig,
    adminUid,
    onAddBarber,
    onUpdateBarber,
    onDeleteBarber,
    onAddService,
    onDeleteAppointment,
    onUpdateService,
    lang
}) => {
    const [activeTab, setActiveTab] = useState<'appointments' | 'barbers' | 'services' | 'analytics' | 'conversations' | 'settings' | 'plan'>('appointments');
    const [filterBarberId, setFilterBarberId] = useState<string>('all');

    // Barber State
    const [isAddingBarber, setIsAddingBarber] = useState(false);
    const [editingBarberId, setEditingBarberId] = useState<string | null>(null);
    const [isGeneratingBio, setIsGeneratingBio] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isSavingBarber, setIsSavingBarber] = useState(false);

    const [barberSearch, setBarberSearch] = useState('');
    const [newBarberName, setNewBarberName] = useState('');
    const [newBarberSpec, setNewBarberSpec] = useState('');
    const [newBarberBio, setNewBarberBio] = useState('');
    const [newBarberAvatar, setNewBarberAvatar] = useState<string>('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // New Staff Success State (QR & Credentials)
    const [newlyCreatedBarber, setNewlyCreatedBarber] = useState<Barber | null>(null);

    // QR Code Display Modal
    const [qrModalBarber, setQrModalBarber] = useState<Barber | null>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

    // Deletion State
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    // New Service State
    const [newServiceName, setNewServiceName] = useState('');
    const [newServiceNameBg, setNewServiceNameBg] = useState('');
    const [newServicePrice, setNewServicePrice] = useState('');
    const [newServiceDuration, setNewServiceDuration] = useState('');
    const [newServiceDesc, setNewServiceDesc] = useState('');
    const [newServiceDescBg, setNewServiceDescBg] = useState('');

    // Service Edit State
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [generatingIconFor, setGeneratingIconFor] = useState<string | null>(null);
    const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
    const [isCreatingService, setIsCreatingService] = useState(false);
    const [isSeeding, setIsSeeding] = useState(false);

    // Conversation Logs State
    const [conversationLogs, setConversationLogs] = useState<ConversationLog[]>([]);
    const [selectedLog, setSelectedLog] = useState<ConversationLog | null>(null);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);

    // Modal State
    const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string; type: 'alert' | 'confirm' }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'alert'
    });

    const T = t[lang].admin;
    const brandName = shopConfig?.branding?.name || 'Blade & Bourbon';
    const aiToolsEnabled = shopConfig?.features?.aiToolsEnabled ?? true;
    const voiceEnabled = shopConfig?.features?.voiceEnabled ?? true;

    const showAlert = (message: string, title: string = "Notice") => {
        setAlertState({ isOpen: true, title, message, type: 'alert' });
    };

    // Load conversation logs when tab is selected
    useEffect(() => {
        if (activeTab === 'conversations') {
            setIsLoadingLogs(true);
            getConversationLogs(shopId, 50).then(logs => {
                setConversationLogs(logs);
                setIsLoadingLogs(false);
            }).catch(err => {
                console.error('Failed to load conversation logs:', err);
                setIsLoadingLogs(false);
            });
        }
    }, [activeTab, shopId]);

    // Analytics Helpers
    const analytics = useMemo(() => {
        let totalRevenue = 0;
        const staffStats: Record<string, { revenue: number; appointments: number; name: string }> = {};
        const clientStats: Record<string, { name: string; visits: number; spent: number; barbers: Record<string, number> }> = {};

        // Initialize staff stats
        state.barbers.forEach(b => {
            staffStats[b.id] = { revenue: 0, appointments: 0, name: lang === 'bg' ? b.nameBg : b.name };
        });

        state.appointments.forEach(apt => {
            const service = state.services.find(s => s.id === apt.serviceId);
            const price = (service && typeof service.price === 'number') ? service.price : 0;

            // Global Revenue
            totalRevenue += price;

            // Staff Stats
            if (staffStats[apt.barberId]) {
                staffStats[apt.barberId].revenue += price;
                staffStats[apt.barberId].appointments += 1;
            }

            // Client Stats (Key by email)
            if (!clientStats[apt.customerEmail]) {
                clientStats[apt.customerEmail] = {
                    name: apt.customerName,
                    visits: 0,
                    spent: 0,
                    barbers: {}
                };
            }
            clientStats[apt.customerEmail].visits += 1;
            clientStats[apt.customerEmail].spent += price;

            // Track favorite barber
            if (!clientStats[apt.customerEmail].barbers[apt.barberId]) {
                clientStats[apt.customerEmail].barbers[apt.barberId] = 0;
            }
            clientStats[apt.customerEmail].barbers[apt.barberId] += 1;
        });

        return {
            totalRevenue,
            totalAppointments: state.appointments.length,
            avgValue: state.appointments.length > 0 ? (totalRevenue / state.appointments.length).toFixed(2) : 0,
            uniqueClients: Object.keys(clientStats).length,
            staffStats: Object.values(staffStats),
            clientStats: Object.values(clientStats).sort((a, b) => b.spent - a.spent) // Top spenders first
        };
    }, [state.appointments, state.barbers, state.services, lang]);

    const filteredAppointments = useMemo(() => {
        if (filterBarberId === 'all') return state.appointments;
        return state.appointments.filter(a => a.barberId === filterBarberId);
    }, [state.appointments, filterBarberId]);

    const filteredBarbers = useMemo(() => {
        if (!barberSearch) return state.barbers;
        const lower = barberSearch.toLowerCase();
        return state.barbers.filter(b =>
            b.name.toLowerCase().includes(lower) ||
            b.specialty.toLowerCase().includes(lower)
        );
    }, [state.barbers, barberSearch]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            // Create a preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewBarberAvatar(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const resetBarberForm = () => {
        setNewBarberName('');
        setNewBarberSpec('');
        setNewBarberBio('');
        setNewBarberAvatar('');
        setAvatarFile(null);
        setEditingBarberId(null);
        setIsAddingBarber(false);
    };

    const handleSaveBarber = async () => {
        if (isSavingBarber) return;
        if (!newBarberName || !newBarberSpec) {
            showAlert("Please enter at least a Name and Specialty.", "Missing Info");
            return;
        }

        setIsSavingBarber(true);
        setIsUploading(true);
        try {
            // Find localized specialty strings
            const specObj = SPECIALTY_OPTIONS.find(s => s.val === newBarberSpec);
            const specEn = specObj ? specObj.en : newBarberSpec;
            const specBg = specObj ? specObj.bg : newBarberSpec;

            // Handle Image Upload
            let avatarUrl = newBarberAvatar;
            if (avatarFile) {
                try {
                    // Upload to a path like barbers/{barberId_timestamp}
                    // Use a temporary ID if creating new, or existing ID if editing
                    const idPart = editingBarberId || `new_${Date.now()}`;
                    const path = `shops/${shopId}/barbers/${idPart}_${avatarFile.name}`;
                    avatarUrl = await uploadImage(avatarFile, path);
                } catch (e) {
                    console.error(e);
                    showAlert("Failed to upload image. Please try again.", "Upload Error");
                    return;
                }
            }

            if (editingBarberId) {
                // UPDATE MODE
                const existingBarber = state.barbers.find(b => b.id === editingBarberId);
                if (existingBarber) {
                    const updatedBarber: Barber = {
                        ...existingBarber,
                        name: newBarberName,
                        nameBg: newBarberName,
                        specialty: specEn,
                        specialtyBg: specBg,
                        bio: newBarberBio || existingBarber.bio,
                        bioBg: newBarberBio || existingBarber.bioBg,
                        avatar: avatarUrl || existingBarber.avatar
                    };
                    await onUpdateBarber(updatedBarber);
                    resetBarberForm();
                }
            } else {
                // CREATE MODE
                // Generate internal dummy credentials (still required by type, but hidden from user)
                const username = newBarberName.toLowerCase().replace(/\s/g, '.') + Math.floor(Math.random() * 100);
                const password = Math.random().toString(36).slice(-8);

                const newBarber: Barber = {
                    id: `b${Date.now()}`,
                    name: newBarberName,
                    nameBg: newBarberName,
                    specialty: specEn,
                    specialtyBg: specBg,
                    bio: newBarberBio || "Expert barber dedicated to precision and style.",
                    bioBg: newBarberBio || "Експерт бръснар.",
                    avatar: avatarUrl || `https://picsum.photos/150/150?random=${Date.now()}`,
                    rating: 5.0,
                    username: username,
                    password: password
                };

                // Add to DB
                await onAddBarber(newBarber);

                // Generate Token & QR Code Immediately
                const token = await generateBarberToken(shopId, newBarber.id);
                // Assign token to local object temporarily for QR generation
                const barberWithToken = { ...newBarber, authToken: token };

                const url = await getQrCodeUrl(barberWithToken);
                setQrCodeUrl(url);
                setNewlyCreatedBarber(barberWithToken);

                resetBarberForm();
            }
        } catch (error) {
            console.error("Error saving barber:", error);
            showAlert("An error occurred while saving.", "Error");
        } finally {
            setIsUploading(false);
            setIsSavingBarber(false);
        }
    };

    const initiateEditBarber = (barber: Barber) => {
        setNewBarberName(barber.name);
        setNewBarberSpec(barber.specialty); // Set to the English value as it acts as ID
        setNewBarberBio(barber.bio);
        setNewBarberAvatar(barber.avatar);
        setEditingBarberId(barber.id);
        setIsAddingBarber(true);
    };

    const initiateDeleteBarber = (barber: Barber) => {
        setPendingDeleteId(barber.id);
        setAlertState({
            isOpen: true,
            title: "Delete Staff Member?",
            message: `Are you sure you want to remove ${barber.name}? This cannot be undone.`,
            type: 'confirm'
        });
    };

    const confirmAction = () => {
        if (pendingDeleteId) {
            onDeleteBarber(pendingDeleteId);
            setPendingDeleteId(null);
        }
        setAlertState(prev => ({ ...prev, isOpen: false }));
    };

    const handleGenerateBio = async () => {
        if (!newBarberBio) {
            showAlert("Please enter some notes in the biography field first.", "Missing Input");
            return;
        }
        setIsGeneratingBio(true);
        try {
            const polished = await generateBarberBio(newBarberBio, newBarberName || "The Barber", lang, brandName);
            if (polished) {
                setNewBarberBio(polished);
            } else {
                showAlert("Could not generate bio. Please try again.", "AI Error");
            }
        } catch (e) {
            console.error(e);
            showAlert("Failed to connect to AI service.", "Error");
        } finally {
            setIsGeneratingBio(false);
        }
    };

    const handleCreateService = async () => {
        if (isCreatingService) return;
        const activeName = lang === 'bg' ? newServiceNameBg : newServiceName;
        if (!activeName || !newServicePrice) return;

        const nameEn = newServiceName || newServiceNameBg;
        const nameBg = newServiceNameBg || newServiceName;
        const descEn = newServiceDesc || newServiceDescBg || "Service description.";
        const descBg = newServiceDescBg || newServiceDesc || "Описание на услугата.";

        const newService: Service = {
            id: `s${Date.now()}`,
            name: nameEn,
            nameBg: nameBg,
            price: isNaN(Number(newServicePrice)) ? newServicePrice : Number(newServicePrice),
            duration: Number(newServiceDuration) || 30,
            description: descEn,
            descriptionBg: descBg,
            icon: "fa-solid fa-scissors" // Default icon
        };

        setIsCreatingService(true);
        try {
            await onAddService(newService);
            // Reset form
            setNewServiceName('');
            setNewServiceNameBg('');
            setNewServicePrice('');
            setNewServiceDuration('');
            setNewServiceDesc('');
            setNewServiceDescBg('');
        } finally {
            setIsCreatingService(false);
        }
    };

    const handleAutoGenerateDesc = async () => {
        const activeName = lang === 'bg' ? newServiceNameBg : newServiceName;
        if (!activeName) {
            showAlert(lang === 'bg' ? "Моля въведете име на услугата." : "Please enter a service name first.", "Missing Input");
            return;
        }
        setIsGeneratingDesc(true);
        try {
            const descriptions = await generateServiceDescriptions(activeName, brandName);
            if (descriptions) {
                setNewServiceDesc(descriptions.en);
                setNewServiceDescBg(descriptions.bg);
            } else {
                showAlert("Failed to generate descriptions.", "Error");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsGeneratingDesc(false);
        }
    };

    const handleSeedServices = async () => {
        setIsSeeding(true);
        try {
            for (const service of INITIAL_SERVICES) {
                await onAddService(service);
            }
            showAlert(`Successfully added ${INITIAL_SERVICES.length} default services!`, "Success");
        } catch (e) {
            console.error(e);
            showAlert("Failed to seed services. Please try again.", "Error");
        } finally {
            setIsSeeding(false);
        }
    };

    const handleGenerateIcon = async (service: Service) => {
        setGeneratingIconFor(service.id);
        try {
            const iconData = await generateServiceIcon(service.name + " icon", brandName);
            if (iconData) {
                onUpdateService({ ...service, imageUrl: iconData });
                if (editingService && editingService.id === service.id) {
                    setEditingService({ ...editingService, imageUrl: iconData });
                }
            } else {
                showAlert("Failed to generate icon. Please try again.", "Error");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setGeneratingIconFor(null);
        }
    };

    const handleSaveService = () => {
        if (editingService) {
            onUpdateService(editingService);
            setEditingService(null);
        }
    };

    const handleServiceChange = (field: keyof Service, value: any) => {
        if (editingService) {
            setEditingService({ ...editingService, [field]: value });
        }
    };

    const getBarberName = (id: string) => {
        const b = state.barbers.find(b => b.id === id);
        return (lang === 'bg' ? b?.nameBg : b?.name) || 'Unknown';
    }
    const getServiceName = (id: string) => {
        const s = state.services.find(s => s.id === id);
        return (lang === 'bg' ? s?.nameBg : s?.name) || 'Unknown';
    }

    const getFavoriteBarberName = (barberCounts: Record<string, number>) => {
        let maxId = '';
        let maxCount = -1;
        Object.entries(barberCounts).forEach(([id, count]) => {
            if (count > maxCount) {
                maxCount = count;
                maxId = id;
            }
        });
        return getBarberName(maxId);
    };

    // Generate QR Code URL with secure token
    const getQrCodeUrl = async (barber: Barber): Promise<string> => {
        // Generate or retrieve existing token
        const token = (barber as any).authToken || await generateBarberToken(shopId, barber.id);
        const baseUrl = import.meta.env.VITE_STAFF_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
        const data = `${baseUrl}?view=staff&staff=${token}`;
        return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data)}&bgcolor=121212&color=d4af37`;
    };

    // Show QR Code Modal
    const handleShowQRCode = async (barber: Barber) => {
        const url = await getQrCodeUrl(barber);
        setQrCodeUrl(url);
        setQrModalBarber(barber);
    };

    if (!shopConfig?.onboarded) {
        return (
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <ShopSettings
                    shopId={shopId}
                    shopConfig={shopConfig}
                    lang={lang}
                    mode="setup"
                    onSave={onSaveShopConfig}
                    adminUid={adminUid}
                />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8">
            <Modal
                isOpen={alertState.isOpen}
                title={alertState.title}
                message={alertState.message}
                onConfirm={confirmAction}
                onCancel={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
                type={alertState.type}
            />

            {/* QR Code Display Modal */}
            {qrModalBarber && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-dark-800 rounded-2xl p-8 max-w-md w-full border border-gold-500/30 relative">
                        <button
                            onClick={() => {
                                setQrModalBarber(null);
                                setQrCodeUrl('');
                            }}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl"
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>

                        <h3 className="text-2xl font-display text-gold-400 mb-2 text-center">
                            Staff Access QR Code
                        </h3>
                        <p className="text-gray-400 text-sm text-center mb-6">
                            {lang === 'bg' ? qrModalBarber.nameBg : qrModalBarber.name}
                        </p>

                        <div className="bg-white p-4 rounded-xl mb-6">
                            {qrCodeUrl && (
                                <img src={qrCodeUrl} alt="QR Code" className="w-full aspect-square" />
                            )}
                        </div>

                        <p className="text-gray-500 text-xs text-center mb-4">
                            Scan this QR code to instantly access the Staff Portal
                        </p>

                        <button
                            onClick={() => {
                                setQrModalBarber(null);
                                setQrCodeUrl('');
                            }}
                            className="w-full bg-gold-600 hover:bg-gold-500 text-black font-bold py-3 rounded transition"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            <h2 className="text-3xl font-display text-gold-400 mb-8">{T.title}</h2>

            <div className="flex gap-4 mb-8 border-b border-gray-700 pb-2 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('appointments')}
                    className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-colors whitespace-nowrap ${activeTab === 'appointments'
                        ? 'text-gold-500 border-b-2 border-gold-500'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    {T.tabs.appointments}
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-colors whitespace-nowrap ${activeTab === 'analytics'
                        ? 'text-gold-500 border-b-2 border-gold-500'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    {T.tabs.analytics}
                </button>
                <button
                    onClick={() => setActiveTab('barbers')}
                    className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-colors whitespace-nowrap ${activeTab === 'barbers'
                        ? 'text-gold-500 border-b-2 border-gold-500'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    {T.tabs.barbers}
                </button>
                <button
                    onClick={() => setActiveTab('services')}
                    className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-colors whitespace-nowrap ${activeTab === 'services'
                        ? 'text-gold-500 border-b-2 border-gold-500'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    {T.tabs.services}
                </button>
                <button
                    onClick={() => setActiveTab('conversations')}
                    className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-colors whitespace-nowrap ${activeTab === 'conversations'
                        ? 'text-gold-500 border-b-2 border-gold-500'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    🎙️ Разговори
                </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-colors whitespace-nowrap ${activeTab === 'settings'
                        ? 'text-gold-500 border-b-2 border-gold-500'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    {lang === 'bg' ? 'Настройки' : 'Settings'}
                </button>
                <button
                    onClick={() => setActiveTab('plan')}
                    className={`px-4 py-2 font-bold uppercase tracking-wider text-sm transition-colors whitespace-nowrap ${activeTab === 'plan'
                        ? 'text-gold-500 border-b-2 border-gold-500'
                        : 'text-gray-400 hover:text-white'
                        }`}
                >
                    {lang === 'bg' ? 'План' : 'Plan'}
                </button>
            </div>

            {activeTab === 'appointments' && (
                <div className="space-y-6">
                    <div className="flex justify-end">
                        <select
                            value={filterBarberId}
                            onChange={(e) => setFilterBarberId(e.target.value)}
                            className="bg-dark-800 text-white border border-gray-600 rounded p-2 text-sm focus:border-gold-500 outline-none"
                        >
                            <option value="all">{T.filters.allBarbers}</option>
                            {state.barbers.map(b => (
                                <option key={b.id} value={b.id}>{lang === 'bg' ? b.nameBg : b.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="bg-dark-800 rounded-lg overflow-hidden border border-gray-800 overflow-x-auto">
                        <table className="w-full text-left min-w-[600px]">
                            <thead className="bg-dark-900 text-gray-400 font-display uppercase text-sm">
                                <tr>
                                    <th className="p-4">{T.table.date}</th>
                                    <th className="p-4">{T.table.customer}</th>
                                    <th className="p-4">{T.table.barber}</th>
                                    <th className="p-4">{T.table.service}</th>
                                    <th className="p-4">{T.table.status}</th>
                                    <th className="p-4">{T.table.actions}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {filteredAppointments.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-500">{T.table.noApts}</td>
                                    </tr>
                                ) : (
                                    filteredAppointments.map(apt => (
                                        <tr key={apt.id} className="hover:bg-dark-700/50 transition">
                                            <td className="p-4">
                                                <div className="text-white font-bold">{new Date(apt.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                <div className="text-xs text-gray-500">{new Date(apt.date).toLocaleDateString()}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-white">{apt.customerName}</div>
                                                <div className="text-xs text-gray-500">{apt.customerEmail}</div>
                                            </td>
                                            <td className="p-4 text-gray-300">{getBarberName(apt.barberId)}</td>
                                            <td className="p-4 text-gold-400">{getServiceName(apt.serviceId)}</td>
                                            <td className="p-4">
                                                <span className="px-2 py-1 rounded-full text-xs bg-green-900/50 text-green-400 border border-green-800 uppercase font-bold">
                                                    {apt.status}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <button
                                                    onClick={() => onDeleteAppointment(apt.id)}
                                                    className="text-red-400 hover:text-red-300 transition"
                                                    title="Cancel Appointment"
                                                >
                                                    <i className="fa-solid fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'analytics' && (
                <div className="space-y-8 animate-fade-in">
                    {/* Overview Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-dark-800 p-4 rounded border border-gold-500/20">
                            <h4 className="text-gray-400 text-xs uppercase mb-1">{T.analytics.revenue}</h4>
                            <p className="text-2xl font-bold text-gold-500">€{analytics.totalRevenue}</p>
                        </div>
                        <div className="bg-dark-800 p-4 rounded border border-gray-700">
                            <h4 className="text-gray-400 text-xs uppercase mb-1">{T.analytics.totalAppts}</h4>
                            <p className="text-2xl font-bold text-white">{analytics.totalAppointments}</p>
                        </div>
                        <div className="bg-dark-800 p-4 rounded border border-gray-700">
                            <h4 className="text-gray-400 text-xs uppercase mb-1">{T.analytics.avgValue}</h4>
                            <p className="text-2xl font-bold text-white">€{analytics.avgValue}</p>
                        </div>
                        <div className="bg-dark-800 p-4 rounded border border-gray-700">
                            <h4 className="text-gray-400 text-xs uppercase mb-1">{T.analytics.clients}</h4>
                            <p className="text-2xl font-bold text-white">{analytics.uniqueClients}</p>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Staff Performance */}
                        <div className="bg-dark-800 p-6 rounded-lg border border-gray-800">
                            <h3 className="text-xl font-display text-white mb-4">{T.analytics.staffPerformance}</h3>
                            <div className="space-y-4">
                                {analytics.staffStats.map((staff, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-dark-900 rounded">
                                        <div>
                                            <div className="font-bold text-white">{staff.name}</div>
                                            <div className="text-xs text-gray-500">{staff.appointments} {T.analytics.colAppts}</div>
                                        </div>
                                        <div className="text-gold-400 font-bold">€{staff.revenue}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Client Base Preview (Top 5) */}
                        <div className="bg-dark-800 p-6 rounded-lg border border-gray-800 overflow-hidden">
                            <h3 className="text-xl font-display text-white mb-4">{T.analytics.clientBase}</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-gray-500 text-xs uppercase text-left">
                                        <tr>
                                            <th className="pb-2">{T.analytics.colName}</th>
                                            <th className="pb-2">{T.analytics.colVisits}</th>
                                            <th className="pb-2">{T.analytics.colSpent}</th>
                                            <th className="pb-2">{T.analytics.colFavBarber}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {analytics.clientStats.map((client, idx) => (
                                            <tr key={idx}>
                                                <td className="py-2 text-white">{client.name}</td>
                                                <td className="py-2 text-gray-400">{client.visits}</td>
                                                <td className="py-2 text-gold-500 font-bold">€{client.spent}</td>
                                                <td className="py-2 text-gray-300">{getFavoriteBarberName(client.barbers)}</td>
                                            </tr>
                                        ))}
                                        {analytics.clientStats.length === 0 && (
                                            <tr><td colSpan={4} className="text-center py-4 text-gray-500">No data</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'barbers' && (
                <div className="animate-fade-in space-y-8">
                    {/* New Staff Success View (Digital ID Only) */}
                    {newlyCreatedBarber && (
                        <div className="bg-gradient-to-br from-dark-800 to-black p-8 rounded-2xl border border-gold-500/50 shadow-2xl relative overflow-hidden max-w-md mx-auto animate-fade-in">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <i className="fa-solid fa-scissors text-9xl text-gold-500"></i>
                            </div>

                            <h3 className="text-2xl font-display text-gold-400 mb-6 text-center uppercase tracking-widest border-b border-gray-800 pb-4">New Staff Access Card</h3>

                            <div className="flex flex-col items-center gap-6">
                                {/* ID Card Visual */}
                                <div className="bg-white text-black rounded-xl p-4 w-64 shadow-xl shrink-0">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="font-display font-bold text-lg leading-none">BLADE &<br />BOURBON</div>
                                        <i className="fa-solid fa-id-card text-2xl text-gold-600"></i>
                                    </div>
                                    <img src={qrCodeUrl} alt="QR Login" className="w-full aspect-square bg-gray-100 rounded mb-4" />
                                    <div className="text-center">
                                        <h4 className="font-bold text-lg uppercase">{newlyCreatedBarber.name}</h4>
                                        <p className="text-xs text-gray-600 uppercase tracking-wider">{newlyCreatedBarber.specialty}</p>
                                    </div>
                                </div>

                                {/* Instructions */}
                                <div className="text-center space-y-4">
                                    <p className="text-sm text-gray-400 italic">
                                        * Scan this QR code now to log in. <br />
                                        You can also access it later from the staff list.
                                    </p>
                                    <button
                                        onClick={() => {
                                            setNewlyCreatedBarber(null);
                                            setQrCodeUrl('');
                                        }}
                                        className="w-full bg-gold-600 hover:bg-gold-500 text-black font-bold py-3 rounded transition shadow-lg"
                                    >
                                        Done & Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {!newlyCreatedBarber && (
                        <div className="grid lg:grid-cols-3 gap-8">
                            {/* Staff List & Search */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xl text-white font-display">{T.currentStaff}</h3>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Filter staff..."
                                            value={barberSearch}
                                            onChange={(e) => setBarberSearch(e.target.value)}
                                            className="bg-dark-800 border border-gray-700 rounded-full py-2 px-4 pl-10 text-sm text-white focus:border-gold-500 outline-none w-64"
                                        />
                                        <i className="fa-solid fa-search absolute left-3.5 top-2.5 text-gray-500 text-xs"></i>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-4">
                                    {filteredBarbers.map(barber => (
                                        <div key={barber.id} className="bg-dark-800 p-4 rounded-xl border border-gray-800 hover:border-gold-500/30 transition flex gap-4 items-start group relative">
                                            <img src={barber.avatar} alt={barber.name} className="w-16 h-16 rounded-full object-cover border-2 border-gray-700 group-hover:border-gold-500 transition-colors" />
                                            <div className="flex-1">
                                                <h4 className="text-white font-bold text-lg">{lang === 'bg' ? barber.nameBg : barber.name}</h4>
                                                <p className="text-gold-500 text-xs uppercase tracking-wider mb-2">{lang === 'bg' ? barber.specialtyBg : barber.specialty}</p>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <span><i className="fa-solid fa-star text-gold-600"></i> {barber.rating}</span>
                                                    <span>•</span>
                                                    <span>ID: {barber.id}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => handleShowQRCode(barber)}
                                                    className="text-gray-500 hover:text-gold-500 bg-dark-900 w-8 h-8 rounded-full flex items-center justify-center border border-gray-700"
                                                    title="Show QR Code"
                                                >
                                                    <i className="fa-solid fa-qrcode text-xs"></i>
                                                </button>
                                                <button
                                                    onClick={() => initiateEditBarber(barber)}
                                                    className="text-gray-500 hover:text-white bg-dark-900 w-8 h-8 rounded-full flex items-center justify-center border border-gray-700"
                                                >
                                                    <i className="fa-solid fa-pen-to-square text-xs"></i>
                                                </button>
                                                <button
                                                    onClick={() => initiateDeleteBarber(barber)}
                                                    className="text-gray-500 hover:text-red-500 bg-dark-900 w-8 h-8 rounded-full flex items-center justify-center border border-gray-700"
                                                >
                                                    <i className="fa-solid fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Add/Edit Barber Panel */}
                            <div>
                                {!isAddingBarber ? (
                                    <button
                                        onClick={() => setIsAddingBarber(true)}
                                        className="w-full h-32 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center text-gray-500 hover:text-gold-500 hover:border-gold-500 hover:bg-dark-800 transition gap-2 group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-dark-800 group-hover:bg-gold-500 group-hover:text-black flex items-center justify-center transition-colors">
                                            <i className="fa-solid fa-plus"></i>
                                        </div>
                                        <span className="font-bold uppercase tracking-wider text-sm">{T.addBarber.btn}</span>
                                    </button>
                                ) : (
                                    <div className="bg-dark-800 p-6 rounded-xl border border-gray-700 animate-fade-in shadow-2xl">
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className="text-xl text-white font-display">
                                                {editingBarberId ? T.addBarber.editTitle : T.addBarber.title}
                                            </h3>
                                            <button onClick={resetBarberForm} className="text-gray-500 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
                                        </div>

                                        <div className="space-y-4">
                                            {/* Image Upload */}
                                            <div className="flex justify-center mb-4">
                                                <div
                                                    className="w-24 h-24 rounded-full bg-dark-900 border-2 border-dashed border-gray-600 hover:border-gold-500 flex items-center justify-center cursor-pointer overflow-hidden relative group"
                                                    onClick={() => fileInputRef.current?.click()}
                                                >
                                                    {newBarberAvatar ? (
                                                        <img src={newBarberAvatar} alt="Preview" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="text-center text-gray-500 group-hover:text-gold-500">
                                                            <i className="fa-solid fa-camera mb-1"></i>
                                                            <div className="text-[10px] uppercase">{T.addBarber.upload}</div>
                                                        </div>
                                                    )}
                                                    <input
                                                        type="file"
                                                        ref={fileInputRef}
                                                        className="hidden"
                                                        accept="image/*"
                                                        onChange={handleImageUpload}
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-gray-400 text-xs uppercase mb-1">{T.addBarber.name}</label>
                                                <input
                                                    type="text"
                                                    value={newBarberName}
                                                    onChange={(e) => setNewBarberName(e.target.value)}
                                                    className="w-full bg-dark-900 border border-gray-700 rounded p-2 text-white focus:border-gold-500 focus:outline-none"
                                                    placeholder={T.placeholders.name}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-gray-400 text-xs uppercase mb-1">{T.addBarber.spec}</label>
                                                <div className="relative">
                                                    <select
                                                        value={newBarberSpec}
                                                        onChange={(e) => setNewBarberSpec(e.target.value)}
                                                        className="w-full bg-dark-900 border border-gray-700 rounded p-2 text-white focus:border-gold-500 focus:outline-none appearance-none"
                                                    >
                                                        <option value="" disabled>{T.placeholders.spec}</option>
                                                        {SPECIALTY_OPTIONS.map(s => (
                                                            <option key={s.val} value={s.val}>
                                                                {lang === 'bg' ? s.bg : s.en}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute right-3 top-3 text-gray-500 pointer-events-none">
                                                        <i className="fa-solid fa-chevron-down text-xs"></i>
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-gray-400 text-xs uppercase mb-1">{T.addBarber.bio}</label>
                                                <div className="relative">
                                                    <textarea
                                                        value={newBarberBio}
                                                        onChange={(e) => setNewBarberBio(e.target.value)}
                                                        className="w-full bg-dark-900 border border-gray-700 rounded p-2 text-white focus:border-gold-500 focus:outline-none"
                                                        rows={3}
                                                        placeholder={T.placeholders.bio}
                                                    />
                                                    <button
                                                        onClick={handleGenerateBio}
                                                        disabled={isGeneratingBio || !aiToolsEnabled}
                                                        className="absolute bottom-2 right-2 text-xs bg-gold-500 hover:bg-gold-400 text-black px-2 py-1 rounded font-bold transition flex items-center gap-1"
                                                        title="AI Polish Bio"
                                                    >
                                                        {isGeneratingBio ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                                                        {T.addBarber.aiPolish}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="pt-2">
                                                <button
                                                    onClick={handleSaveBarber}
                                                    disabled={isUploading || isGeneratingBio || isSavingBarber}
                                                    className={`w-full bg-gold-600 hover:bg-gold-500 text-black font-bold py-3 px-4 rounded transition flex items-center justify-center gap-2 ${isUploading || isSavingBarber ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    {isUploading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : (editingBarberId ? <i className="fa-solid fa-save"></i> : <i className="fa-solid fa-user-plus"></i>)}
                                                    {isUploading ? ' Saving...' : (editingBarberId ? T.addBarber.updateBtn : T.addBarber.createBtn)}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'services' && (
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Add New Service Form */}
                    <div className="w-full lg:w-1/4 bg-dark-800 p-6 rounded-lg border border-gray-800 h-fit">
                        <h3 className="text-xl text-white mb-4 font-display">{T.addService.title}</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-gray-400 text-xs mb-1">{lang === 'bg' ? T.addService.nameBg : T.addService.nameEn}</label>
                                <input
                                    className="w-full bg-dark-900 border border-gray-700 rounded p-2 text-sm text-white"
                                    value={lang === 'bg' ? newServiceNameBg : newServiceName}
                                    onChange={e => (lang === 'bg' ? setNewServiceNameBg(e.target.value) : setNewServiceName(e.target.value))}
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-xs mb-1">{T.addService.price}</label>
                                    <input className="w-full bg-dark-900 border border-gray-700 rounded p-2 text-sm text-white" value={newServicePrice} onChange={e => setNewServicePrice(e.target.value)} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-gray-400 text-xs mb-1">{T.addService.duration}</label>
                                    <input type="number" className="w-full bg-dark-900 border border-gray-700 rounded p-2 text-sm text-white" value={newServiceDuration} onChange={e => setNewServiceDuration(e.target.value)} />
                                </div>
                            </div>

                            <button
                                onClick={handleAutoGenerateDesc}
                                disabled={isGeneratingDesc || !aiToolsEnabled}
                                className="w-full bg-dark-700 border border-gray-600 hover:border-gold-500 text-gold-500 text-xs font-bold py-2 rounded transition flex items-center justify-center gap-2 mb-2"
                            >
                                {isGeneratingDesc ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                                {T.addService.aiGen}
                            </button>

                            <div>
                                <label className="block text-gray-400 text-xs mb-1">{lang === 'bg' ? T.addService.descBg : T.addService.descEn}</label>
                                <textarea
                                    className="w-full bg-dark-900 border border-gray-700 rounded p-2 text-sm text-white"
                                    rows={2}
                                    value={lang === 'bg' ? newServiceDescBg : newServiceDesc}
                                    onChange={e => (lang === 'bg' ? setNewServiceDescBg(e.target.value) : setNewServiceDesc(e.target.value))}
                                />
                            </div>

                            <button
                                onClick={handleCreateService}
                                disabled={isCreatingService}
                                className="w-full bg-gold-600 hover:bg-gold-500 text-black font-bold py-2 rounded transition mt-2 disabled:opacity-60"
                            >
                                {isCreatingService ? (lang === 'bg' ? 'Запазване...' : 'Saving...') : T.addService.btn}
                            </button>
                        </div>
                    </div>

                    {/* Services List */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {state.services.map(s => (
                            <div key={s.id} className="bg-dark-800 p-6 rounded-lg border border-gray-800 hover:border-gold-500/50 transition flex flex-col h-full">
                                {editingService?.id === s.id ? (
                                    <div className="space-y-3 flex-1">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-xs text-gray-500">Name (EN)</label>
                                                <input
                                                    className="w-full bg-dark-900 border border-gray-600 rounded p-1 text-sm text-white"
                                                    value={editingService.name}
                                                    onChange={(e) => handleServiceChange('name', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500">Name (BG)</label>
                                                <input
                                                    className="w-full bg-dark-900 border border-gray-600 rounded p-1 text-sm text-white"
                                                    value={editingService.nameBg}
                                                    onChange={(e) => handleServiceChange('nameBg', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-xs text-gray-500">Price (€)</label>
                                                <input
                                                    className="w-full bg-dark-900 border border-gray-600 rounded p-1 text-sm text-white"
                                                    value={editingService.price}
                                                    onChange={(e) => handleServiceChange('price', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500">Minutes</label>
                                                <input
                                                    type="number"
                                                    className="w-full bg-dark-900 border border-gray-600 rounded p-1 text-sm text-white"
                                                    value={editingService.duration}
                                                    onChange={(e) => handleServiceChange('duration', parseInt(e.target.value))}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Desc (EN)</label>
                                            <textarea
                                                className="w-full bg-dark-900 border border-gray-600 rounded p-1 text-sm text-white"
                                                rows={2}
                                                value={editingService.description}
                                                onChange={(e) => handleServiceChange('description', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Desc (BG)</label>
                                            <textarea
                                                className="w-full bg-dark-900 border border-gray-600 rounded p-1 text-sm text-white"
                                                rows={2}
                                                value={editingService.descriptionBg}
                                                onChange={(e) => handleServiceChange('descriptionBg', e.target.value)}
                                            />
                                        </div>
                                        <div className="flex gap-2 pt-2">
                                            <button onClick={handleSaveService} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-1 rounded text-sm font-bold">Save</button>
                                            <button onClick={() => setEditingService(null)} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-1 rounded text-sm">Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="text-xl font-display text-white">{lang === 'bg' ? s.nameBg : s.name}</h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gold-400 font-bold">€{s.price}</span>
                                                <button onClick={() => setEditingService(s)} className="text-gray-500 hover:text-gold-500 transition">
                                                    <i className="fa-solid fa-pen-to-square"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mb-4 flex justify-center py-4 bg-black rounded">
                                            {s.imageUrl ? (
                                                <img src={s.imageUrl} alt={s.name} className="w-16 h-16 object-contain" />
                                            ) : (
                                                <i className={`${s.icon} text-4xl text-gold-500`}></i>
                                            )}
                                        </div>
                                        <p className="text-gray-400 text-sm mb-4 flex-1">{lang === 'bg' ? s.descriptionBg : s.description}</p>
                                        <button
                                            onClick={() => handleGenerateIcon(s)}
                                            disabled={generatingIconFor === s.id || !aiToolsEnabled}
                                            className="w-full bg-dark-700 hover:bg-gold-500 hover:text-black border border-gray-600 text-white py-2 rounded transition flex items-center justify-center gap-2 mt-auto"
                                        >
                                            {generatingIconFor === s.id ? (
                                                <><i className="fa-solid fa-spinner fa-spin"></i> Generating...</>
                                            ) : (
                                                <><i className="fa-solid fa-wand-magic-sparkles"></i> AI Icon</>
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="animate-fade-in">
                    <ShopSettings
                        shopId={shopId}
                        shopConfig={shopConfig}
                        lang={lang}
                        mode="edit"
                        onSave={onSaveShopConfig}
                        adminUid={adminUid}
                    />
                </div>
            )}

            {activeTab === 'plan' && (
                <div className="animate-fade-in">
                    <PlanSettings
                        shopId={shopId}
                        shopConfig={shopConfig}
                        lang={lang}
                        onSave={onSaveShopConfig}
                    />
                </div>
            )}

            {/* Conversations Tab */}
            {activeTab === 'conversations' && (
                <div className="space-y-6">
                    <h2 className="text-2xl font-display text-white mb-4">🎙️ Разговори с гласовия асистент</h2>

                    {!voiceEnabled && (
                        <div className="bg-dark-800 border border-gray-700 rounded-lg p-6 text-gray-400 text-center">
                            {lang === 'bg' ? 'Voice асистентът е изключен за този план.' : 'Voice assistant is disabled for this plan.'}
                        </div>
                    )}

                    {voiceEnabled && (isLoadingLogs ? (
                        <div className="text-center py-12">
                            <i className="fa-solid fa-spinner fa-spin text-3xl text-gold-500"></i>
                            <p className="text-gray-400 mt-4">Зареждане...</p>
                        </div>
                    ) : conversationLogs.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <i className="fa-solid fa-comments text-4xl mb-4 block"></i>
                            <p>Няма записани разговори</p>
                        </div>
                    ) : (
                        <div className="grid lg:grid-cols-2 gap-6">
                            {/* Logs List */}
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {conversationLogs.map(log => (
                                    <div
                                        key={log.id}
                                        onClick={() => setSelectedLog(log)}
                                        className={`bg-dark-800 border rounded-lg p-4 cursor-pointer transition hover:border-gold-500/50 ${selectedLog?.id === log.id ? 'border-gold-500' : 'border-gray-700'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-white font-medium">
                                                {new Date(log.startTime).toLocaleDateString('bg-BG')} {new Date(log.startTime).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className={`text-xs px-2 py-1 rounded ${log.outcome === 'completed' ? 'bg-green-500/20 text-green-400' :
                                                log.outcome === 'abandoned' ? 'bg-yellow-500/20 text-yellow-400' :
                                                    log.outcome === 'error' ? 'bg-red-500/20 text-red-400' :
                                                        'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {log.outcome === 'completed' ? '✅ Завършен' :
                                                    log.outcome === 'abandoned' ? '⏸️ Прекъснат' :
                                                        log.outcome === 'error' ? '❌ Грешка' : '🔄 Активен'}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-400 space-y-1">
                                            <div>⏱️ {log.duration ? `${log.duration} сек` : 'В процес...'}</div>
                                            <div>🔧 {log.toolCalls} инструмента</div>
                                            {log.bookingCreated && <div className="text-green-400">📅 Създадена резервация</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Log Detail */}
                            <div className="bg-dark-800 border border-gray-700 rounded-lg p-4 max-h-[600px] overflow-y-auto">
                                {selectedLog ? (
                                    <div>
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-lg font-display text-white">
                                                Детайли на разговора
                                            </h3>
                                            <button
                                                onClick={async () => {
                                                    if (confirm('Сигурни ли сте, че искате да изтриете този разговор?')) {
                                                        try {
                                                            await deleteConversationLog(shopId, selectedLog.id);
                                                            setConversationLogs(prev => prev.filter(l => l.id !== selectedLog.id));
                                                            setSelectedLog(null);
                                                        } catch (err) {
                                                            alert('Грешка при изтриване');
                                                        }
                                                    }
                                                }}
                                                className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm"
                                            >
                                                <i className="fa-solid fa-trash mr-1"></i>
                                                Изтрий
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {selectedLog.events.map((event, idx) => (
                                                <div key={idx} className={`p-3 rounded-lg ${event.type === 'agent_response' ? 'bg-gold-500/10 border-l-4 border-gold-500' :
                                                    event.type === 'user_speech' ? 'bg-blue-500/10 border-l-4 border-blue-500' :
                                                        event.type === 'tool_call' ? 'bg-purple-500/10 border-l-4 border-purple-500' :
                                                            'bg-gray-700/50 border-l-4 border-gray-500'
                                                    }`}>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-xs font-bold uppercase text-gray-400">
                                                            {event.type === 'agent_response' ? '🤖 Асистент' :
                                                                event.type === 'user_speech' ? '👤 Клиент' :
                                                                    event.type === 'tool_call' ? '🔧 Инструмент' : '⚙️ Система'}
                                                        </span>
                                                        <span className="text-xs text-gray-500">
                                                            {new Date(event.timestamp).toLocaleTimeString('bg-BG')}
                                                        </span>
                                                    </div>
                                                    <p className="text-white text-sm">{event.content}</p>
                                                    {event.metadata && (
                                                        <pre className="text-xs text-gray-400 mt-2 bg-black/30 p-2 rounded overflow-x-auto">
                                                            {JSON.stringify(event.metadata, null, 2)}
                                                        </pre>
                                                    )}
                                                </div>
                                            ))}
                                            {selectedLog.events.length === 0 && (
                                                <p className="text-gray-500 text-center py-4">Няма записани събития</p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center text-gray-500 py-12">
                                        <i className="fa-solid fa-hand-pointer text-3xl mb-4 block"></i>
                                        <p>Изберете разговор от списъка</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
