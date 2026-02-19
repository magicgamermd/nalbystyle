import React, { useState, useEffect } from 'react';
import { AppState, Barber, Appointment, Language, Service, ShopConfig } from './types';
import { subscribeToAuth, logoutUser } from './services/auth';
import { Login } from './components/Login';
import { User } from 'firebase/auth';
import { INITIAL_SERVICES, INITIAL_BARBERS } from './constants';
import { ChatBot } from './components/ChatBot';
import { BookingWizard } from './components/BookingWizard';
import { AdminDashboard } from './components/AdminDashboard';
import { ServiceCatalog } from './components/ServiceCatalog';
import { BarberShowcase } from './components/BarberShowcase';
import { StaffPortal } from './components/StaffPortal';
import { VoiceAgentHybrid } from './components/VoiceAgentHybrid';
import { AnimatePresence } from 'framer-motion';
import { AnimatedPage } from './components/AnimatedPage';
import { t } from './utils/translations';
import {
  getServices,
  getBarbers,
  getAppointments,
  addAppointment,
  addBarber,
  updateService,
  deleteAppointment,
  updateAppointment,
  addService,
  updateBarber,
  deleteBarber,
  validateStaffToken,
  subscribeToServices,
  subscribeToBarbers,
  subscribeToAppointments
} from './services/db';
import { createShopConfig, getShopIdFromHost, subscribeToShopConfig } from './services/shopService';

type View = 'home' | 'booking' | 'admin' | 'services' | 'barbers' | 'staff';

// Helper function to check URL for view parameter
const getInitialView = (): View => {
  if (typeof window !== 'undefined') {
    // STAFF-ONLY BUILD: Force staff view (for staff subdomain deployment)
    if (import.meta.env.VITE_STAFF_ONLY === 'true') {
      return 'staff';
    }

    // Check URL parameters
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    // Validate that the param is a valid View type
    if (viewParam === 'staff') return 'staff';
    if (viewParam === 'admin') return 'admin';
    if (viewParam === 'booking') return 'booking';
    if (viewParam === 'services') return 'services';
    if (viewParam === 'barbers') return 'barbers';
  }
  return 'home';
};

const App: React.FC = () => {
  // Initialize view state based on the URL parameter
  const [view, setView] = useState<View>(getInitialView);
  // Loading state checks for token presence to avoid flash of content
  // AGGRESSIVE LOADER: If URL contains "staff", start loading immediately
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      // Check both query param AND subdomain/hostname to be safe
      const params = new URLSearchParams(window.location.search);
      if (params.get('staff') || window.location.hostname.includes('staff')) return true;
    }
    return false;
  });
  const [lang, setLang] = useState<Language>('bg'); // Default to BG
  const [appState, setAppState] = useState<AppState>({
    services: [], // Initial state is empty, will be populated from DB
    barbers: [],
    appointments: []
  });
  const [shopId, setShopId] = useState<string>('');
  const [shopConfig, setShopConfig] = useState<ShopConfig | null>(null);
  const [isShopLoading, setIsShopLoading] = useState(true);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingView, setPendingView] = useState<View | null>(null);

  // Staff Auto-Login State
  const [authenticatedStaffBarber, setAuthenticatedStaffBarber] = useState<Barber | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = getShopIdFromHost(window.location.hostname);
    setShopId(id);
  }, []);

  useEffect(() => {
    if (!shopId) return;
    setIsShopLoading(true);
    const unsub = subscribeToShopConfig(shopId, (config) => {
      setShopConfig(config);
      setIsShopLoading(false);
    });
    return () => unsub();
  }, [shopId]);

  useEffect(() => {
    if (!shopConfig?.themeId) return;
    document.documentElement.dataset.theme = shopConfig.themeId;
  }, [shopConfig?.themeId]);

  useEffect(() => {
    if (!shopConfig?.branding?.name) return;
    document.title = `${shopConfig.branding.name} | Barber Studio`;
  }, [shopConfig?.branding?.name]);

  // Helper for translations
  const T = t[lang];

  // Real-time Data Subscriptions
  useEffect(() => {
    if (!shopId) return;
    const unsubServices = subscribeToServices(shopId, (services) => {
      setAppState(prev => ({ ...prev, services }));
    });

    const unsubBarbers = subscribeToBarbers(shopId, (barbers) => {
      setAppState(prev => ({ ...prev, barbers }));
    });

    const unsubAppointments = subscribeToAppointments(shopId, (appointments) => {
      setAppState(prev => ({ ...prev, appointments }));
    });

    return () => {
      unsubServices();
      unsubBarbers();
      unsubAppointments();
    };
  }, [shopId]);

  // Auth Subscription
  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Staff Auto-Login via QR Code Token
  useEffect(() => {
    const handleStaffAutoLogin = async () => {
      if (!shopId) return;
      // Check URL for staff token (we keep it in URL for PWA reliability)
      const params = new URLSearchParams(window.location.search);
      const token = params.get('staff');

      if (!token) {
        // If no token, we are done loading staff context
        setIsLoading(false);
        return;
      }

      // If we have a token, we must wait for barbers to load to validate it
      if (appState.barbers.length === 0) {
        return;
      }

      try {
        const barber = await validateStaffToken(shopId, token);
        if (barber) {
          setAuthenticatedStaffBarber(barber);
          if (view !== 'staff') {
            setView('staff');
          }
        }
      } catch (error) {
        console.error('Staff auto-login failed:', error);
      } finally {
        // Validation attempt finished
        setIsLoading(false);
      }
    };

    handleStaffAutoLogin();
  }, [appState.barbers, view, shopId]);

  // Intercept protected views
  const handleViewChange = (newView: View) => {
    if (newView === 'admin' || newView === 'staff') {
      if (!user) {
        setPendingView(newView);
        setShowLoginModal(true);
        return;
      }
    }
    setView(newView);
  };

  const handleLoginSuccess = () => {
    setShowLoginModal(false);
    if (pendingView) {
      setView(pendingView);
      setPendingView(null);
    }
  };

  // Update URL whenever the view changes (without reloading page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (view === 'home') {
      params.delete('view');
    } else {
      params.set('view', view);
    }

    const queryString = params.toString();
    const newUrl = queryString ? `?${queryString}` : window.location.pathname;

    // Update browser history/URL bar
    window.history.replaceState(null, '', newUrl);
  }, [view]);

  const handleBooking = async (appt: Appointment) => {
    try {
      await addAppointment(shopId, appt);
      // If we are in staff view, stay in staff view, else go home
      if (view !== 'staff') {
        setView('home');
      }
    } catch (error) {
      console.error("Booking error:", error);
    }
  };

  const handleAddBarber = async (barber: Barber) => {
    try {
      await addBarber(shopId, barber);
    } catch (error) {
      console.error("Add barber error:", error);
    }
  };

  const handleUpdateBarber = async (updatedBarber: Barber) => {
    try {
      await updateBarber(shopId, updatedBarber);
      setAppState(prev => ({
        ...prev,
        barbers: prev.barbers.map(b => b.id === updatedBarber.id ? updatedBarber : b)
      }));
    } catch (error) {
      console.error("Update barber error:", error);
    }
  };

  const handleDeleteBarber = async (id: string) => {
    try {
      await deleteBarber(shopId, id);
      setAppState(prev => ({
        ...prev,
        barbers: prev.barbers.filter(b => b.id !== id)
      }));
    } catch (error) {
      console.error("Delete barber error:", error);
    }
  };

  const handleAddService = async (service: Service) => {
    try {
      await addService(shopId, service);
    } catch (error) {
      console.error("Add service error:", error);
    }
  };

  const handleUpdateService = async (updatedService: Service) => {
    try {
      await updateService(shopId, updatedService);
      setAppState(prev => ({
        ...prev,
        services: prev.services.map(s => s.id === updatedService.id ? updatedService : s)
      }));
    } catch (error) {
      console.error("Update service error:", error);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    try {
      // SOFT DELETE: Update status to cancelled instead of removing document
      await updateAppointment(shopId, { id, status: 'cancelled' });
      setAppState(prev => ({
        ...prev,
        appointments: prev.appointments.map(a =>
          a.id === id ? { ...a, status: 'cancelled' } : a
        )
      }));
    } catch (error) {
      console.error("Cancel appointment error:", error);
    }
  };

  const navigateToBooking = (barberId?: string) => {
    setView('booking');
  };

  const toggleLang = () => {
    setLang(prev => prev === 'en' ? 'bg' : 'en');
  };

  // Staff Logout Handler
  const handleStaffLogout = () => {
    setAuthenticatedStaffBarber(null);
    setView('home');
  };

  const brandName = shopConfig?.branding?.name || 'Nalby Style';
  const logoUrl = '/images/nalby-logo.png';
  const heroMobile = '/images/nalby-hero-mobile.jpg';
  const heroDesktop = '/images/nalby-hero-desktop.jpg';
  const contactAddress = shopConfig?.contact?.address || T.contact.address;
  const contactPhone = shopConfig?.contact?.phone || T.contact.phone;
  const contactEmail = shopConfig?.contact?.email || T.contact.email;
  const hoursMonFri = shopConfig?.hours?.monFri || T.contact.hours;
  const hoursSat = shopConfig?.hours?.sat || '';
  const hoursSun = shopConfig?.hours?.sun || T.contact.sunday;
  const voiceEnabled = shopConfig?.features?.voiceEnabled ?? true;
  const chatEnabled = shopConfig?.features?.chatEnabled ?? false;
  const assistantName = shopConfig?.voiceAgentName || 'Assistant';
  const mapQuery = encodeURIComponent(contactAddress);
  const mapEmbedUrl = `https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
  const mapLinkUrl = `https://maps.google.com/maps?q=${mapQuery}`;

  // LOADING SCREEN
  if (isLoading || isShopLoading) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center overflow-hidden">
        {/* Ambient Background */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 animate-pulse-slow"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gold-500/5 rounded-full blur-3xl animate-pulse"></div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-12">
            {/* Rotating Ring */}
            <div className="absolute -inset-6 border-2 border-gold-500/20 border-t-gold-500 rounded-full w-32 h-32 animate-spin-slow"></div>
            <div className="absolute -inset-2 border border-gold-500/10 rounded-full w-24 h-24"></div>

            {/* Central Icon */}
            <div className="w-20 h-20 flex items-center justify-center bg-dark-900 rounded-full border border-gray-800 shadow-2xl relative z-20">
              <i className="fa-solid fa-scissors text-3xl text-gold-500"></i>
            </div>
          </div>

          <h1 className="font-display font-bold text-3xl tracking-[0.4em] text-white mb-2 animate-fade-in-up">
            {brandName.toUpperCase()}
          </h1>

          <p className="text-gold-500/60 text-xs uppercase tracking-widest animate-pulse mt-4">
            Accessing Secure Portal
          </p>

          {/* Elegant Line Loader */}
          <div className="mt-8 flex gap-1">
            <div className="w-2 h-2 bg-gold-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-gold-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-gold-500 rounded-full animate-bounce"></div>
          </div>
        </div>
      </div>
    );
  }

  // If in Staff View, render the portal exclusively without the standard layout wrapper
  if (view === 'staff') {
    // Check if staff is authenticated via QR code (bypasses normal auth)
    if (!user && !authenticatedStaffBarber) {
      setView('home');
      return null;
    }
    return (
      <StaffPortal
        state={appState}
        onBook={handleBooking}
        onDeleteAppointment={handleDeleteAppointment}
        onReturnHome={handleStaffLogout}
        lang={lang}
        authenticatedBarber={authenticatedStaffBarber}
        brandName={brandName}
        logoUrl={logoUrl}
      />
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 font-body text-gray-200 flex flex-col">
      {showLoginModal && (
        <Login
          onLoginSuccess={handleLoginSuccess}
          onCancel={() => { setShowLoginModal(false); setPendingView(null); }}
        />
      )}
      {/* Navbar */}
      <nav className="fixed top-0 w-full bg-dark-900/90 backdrop-blur-md border-b border-white/10 z-40">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
            <img
              src={logoUrl}
              alt={brandName}
              className="h-16 w-auto cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => handleViewChange('home')}
            />
          <div className="hidden md:flex gap-8 items-center">
            <button
              onClick={() => handleViewChange('home')}
              className={`text-sm tracking-wider uppercase hover:text-gold-400 transition ${view === 'home' ? 'text-gold-500' : 'text-gray-300'}`}
            >
              {T.nav.home}
            </button>
            <button
              onClick={() => handleViewChange('services')}
              className={`text-sm tracking-wider uppercase hover:text-gold-400 transition ${view === 'services' ? 'text-gold-500' : 'text-gray-300'}`}
            >
              {T.nav.services}
            </button>
            <button
              onClick={() => handleViewChange('barbers')}
              className={`text-sm tracking-wider uppercase hover:text-gold-400 transition ${view === 'barbers' ? 'text-gold-500' : 'text-gray-300'}`}
            >
              {T.nav.barbers}
            </button>
            <button
              onClick={() => handleViewChange('booking')}
              className={`text-sm tracking-wider uppercase hover:text-gold-400 transition ${view === 'booking' ? 'text-gold-500' : 'text-gray-300'}`}
            >
              {T.nav.bookShort}
            </button>
            <button
              onClick={() => handleViewChange('admin')}
              className={`text-sm tracking-wider uppercase hover:text-gold-400 transition ${view === 'admin' ? 'text-gold-500' : 'text-gray-300'}`}
            >
              {T.nav.admin}
            </button>
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 border border-gold-500/30 rounded px-2 py-1 text-xs text-gold-500 font-bold hover:bg-gold-500 hover:text-black transition"
            >
              <i className="fa-solid fa-globe"></i> {lang.toUpperCase()}
            </button>
          </div>

          <div className="md:hidden flex gap-4 items-center">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 border border-gold-500/30 rounded px-2 py-1 text-xs text-gold-500 font-bold"
            >
              {lang.toUpperCase()}
            </button>

            {user && (
              <button onClick={() => { logoutUser(); setView('home'); }} className="text-xs text-red-500 hover:text-red-400 uppercase tracking-widest ml-4">
                Logout
              </button>
            )}
            <button
              onClick={() => setView('booking')}
              className="bg-gold-500 text-black px-4 py-2 rounded font-bold"
            >
              {T.nav.bookShort}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 pt-20">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <AnimatedPage key="home">
              <div className="animate-fade-in">
                {/* Hero Section */}
                <div
                  className="relative h-[80vh] flex items-end justify-center overflow-hidden pb-16"
                >
                  {/* Mobile hero image */}
                  <div
                    className="absolute inset-0 md:hidden bg-cover bg-center transition-all duration-500"
                    style={{ backgroundImage: `url(${heroMobile || '/images/nalby-hero-mobile.jpg'})` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-transparent to-transparent"></div>
                  </div>
                  {/* Desktop hero image */}
                  <div
                    className="absolute inset-0 hidden md:block bg-cover bg-center transition-all duration-500"
                    style={{ backgroundImage: `url(${heroDesktop || '/images/nalby-hero-desktop.jpg'})` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-transparent to-transparent"></div>
                  </div>

                  <div className="relative z-10 text-center px-4 w-full">
                    <div className="flex flex-col md:flex-row gap-4 justify-center">
                      <button
                        onClick={() => setView('booking')}
                        className="bg-gold-500 hover:bg-gold-400 text-dark-900 text-lg font-bold px-8 py-4 rounded transition-all transform hover:-translate-y-1 shadow-[0_10px_20px_-10px_rgba(212,175,55,0.5)]"
                      >
                        {T.hero.ctaBook}
                      </button>
                      <button
                        onClick={() => setView('services')}
                        className="bg-black/50 backdrop-blur-md border border-white/30 hover:border-gold-500 hover:text-gold-500 text-white text-lg px-8 py-4 rounded transition-colors"
                      >
                        {T.hero.ctaServices}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Features Strip */}
                <div className="bg-dark-800 py-16 border-y border-white/5">
                  <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                    <div className="p-6 cursor-pointer hover:bg-dark-700/50 rounded-lg transition" onClick={() => setView('barbers')}>
                      <i className="fa-solid fa-scissors text-4xl text-gold-500 mb-4"></i>
                      <h3 className="text-xl font-display text-white mb-2">{T.features.barbersTitle}</h3>
                      <p className="text-gray-400">{T.features.barbersDesc}</p>
                    </div>
                    <div className="p-6 border-l border-r border-white/5">
                      <i className="fa-solid fa-wine-glass text-4xl text-gold-500 mb-4"></i>
                      <h3 className="text-xl font-display text-white mb-2">{T.features.premiumTitle}</h3>
                      <p className="text-gray-400">{T.features.premiumDesc}</p>
                    </div>
                    <div className="p-6">
                      <i className="fa-solid fa-wand-magic-sparkles text-4xl text-gold-500 mb-4"></i>
                      <h3 className="text-xl font-display text-white mb-2">{T.features.aiTitle}</h3>
                      <p className="text-gray-400">{T.features.aiDesc}</p>
                    </div>
                  </div>
                </div>

                {/* Contact & Map Section (Integrated from components/App.tsx) */}
                <div className="bg-dark-900 py-24 relative overflow-hidden">
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-5 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>

                  <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="text-center mb-16">
                      <h2 className="text-gold-500 text-sm uppercase tracking-[0.3em] mb-4">{T.contact.title}</h2>
                      <p className="text-gray-400 max-w-2xl mx-auto text-lg">{T.contact.subtitle}</p>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-12 items-stretch">
                      {/* Contact Info */}
                      <div className="space-y-8 flex flex-col justify-center">
                        <div className="bg-dark-800 p-8 rounded-2xl border border-gray-800 hover:border-gold-500/30 transition duration-300 group">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-500 group-hover:bg-gold-500 group-hover:text-black transition-colors">
                              <i className="fa-solid fa-location-dot text-xl"></i>
                            </div>
                            <div>
                              <h3 className="font-display font-bold text-white text-lg mb-2">{T.contact.addressTitle}</h3>
                              <p className="text-gray-400 leading-relaxed">{contactAddress}</p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-dark-800 p-8 rounded-2xl border border-gray-800 hover:border-gold-500/30 transition duration-300 group">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-500 group-hover:bg-gold-500 group-hover:text-black transition-colors">
                              <i className="fa-solid fa-phone text-xl"></i>
                            </div>
                            <div>
                              <h3 className="font-display font-bold text-white text-lg mb-2">{T.contact.phoneTitle}</h3>
                              <p className="text-gray-400">{contactPhone}</p>
                              <p className="text-gray-500 text-sm mt-1">{contactEmail}</p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-dark-800 p-8 rounded-2xl border border-gray-800 hover:border-gold-500/30 transition duration-300 group">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-500 group-hover:bg-gold-500 group-hover:text-black transition-colors">
                              <i className="fa-solid fa-clock text-xl"></i>
                            </div>
                            <div>
                              <h3 className="font-display font-bold text-white text-lg mb-2">{T.contact.hoursTitle}</h3>
                              <p className="text-gray-400">{hoursMonFri}</p>
                              {hoursSat && <p className="text-gray-500 text-sm mt-1">{hoursSat}</p>}
                              <p className="text-gray-500 text-sm mt-1">{hoursSun}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Map */}
                      <div className="h-[500px] w-full rounded-2xl overflow-hidden border border-gray-800 shadow-2xl relative group">
                        <iframe
                          src={mapEmbedUrl}
                          className="w-full h-full grayscale group-hover:grayscale-0 transition duration-700"
                          frameBorder="0"
                          allowFullScreen
                          loading="lazy"
                        ></iframe>
                        <div className="absolute bottom-6 left-6 right-6">
                          <a
                            href={mapLinkUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block w-full bg-black/80 backdrop-blur-md text-white text-center py-4 rounded-xl border border-white/10 hover:bg-gold-500 hover:text-black hover:border-gold-500 transition-all font-bold uppercase tracking-wider"
                          >
                            {T.contact.getDirections} <i className="fa-solid fa-arrow-right ml-2"></i>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </AnimatedPage>
          )}

          {view === 'booking' && (
            <AnimatedPage key="booking">
              <div className="py-12">
                <BookingWizard state={appState} onBook={handleBooking} lang={lang} />
              </div>
            </AnimatedPage>
          )}

          {view === 'services' && (
            <AnimatedPage key="services">
              <div className="py-12">
                <ServiceCatalog services={appState.services} onBookNow={() => setView('booking')} lang={lang} />
              </div>
            </AnimatedPage>
          )}

          {view === 'barbers' && (
            <AnimatedPage key="barbers">
              <div className="py-12">
                <BarberShowcase barbers={appState.barbers} onBookBarber={navigateToBooking} lang={lang} />
              </div>
            </AnimatedPage>
          )}

          {view === 'admin' && (
            <AnimatedPage key="admin">
              <div className="py-12">
                  <AdminDashboard
                    state={appState}
                    shopId={shopId}
                    shopConfig={shopConfig}
                    onSaveShopConfig={async (config) => {
                      await createShopConfig(shopId, config);
                      setShopConfig(config);
                    }}
                    adminUid={user?.uid}
                    onAddBarber={handleAddBarber}
                    onUpdateBarber={handleUpdateBarber}
                    onDeleteBarber={handleDeleteBarber}
                    onAddService={handleAddService}
                    onDeleteAppointment={handleDeleteAppointment}
                    onUpdateService={handleUpdateService}
                    lang={lang}
                  />
              </div>
            </AnimatedPage>
          )}
        </AnimatePresence>
      </main>

      {/* AI Chat Bot */}
      {chatEnabled && view !== 'admin' && view !== 'staff' && (
        <ChatBot
          services={appState.services}
          barbers={appState.barbers}
          lang={lang}
          shopName={brandName}
          assistantName={assistantName}
        />
      )}

      {/* Voice Agent - only for customers (not in staff portal) */}
      {!import.meta.env.VITE_STAFF_ONLY && view !== 'admin' && view !== 'staff' && (
        <VoiceAgentHybrid shopName={brandName} />
      )}

      {/* Footer */}
      <footer className="bg-black text-gray-500 py-12 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-display font-bold text-xl text-white tracking-widest">
            {brandName.toUpperCase()}
          </div>
          <div className="text-sm">
            © 2024 Nalby Style. All rights reserved.
          </div>
          <div className="flex gap-4 items-center">
            <a href="#" className="hover:text-gold-500 transition"><i className="fa-brands fa-instagram"></i></a>
            <a href="#" className="hover:text-gold-500 transition"><i className="fa-brands fa-facebook"></i></a>
            <button onClick={() => handleViewChange('staff')} className="text-xs text-gray-700 hover:text-gold-500 uppercase tracking-widest ml-4">{T.nav.staffLogin}</button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
