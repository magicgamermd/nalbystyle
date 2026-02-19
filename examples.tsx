// Example usage in a Next.js or React app
import React, { useEffect, useState } from 'react';
import { VoiceAgentHybridIntegrated } from './VoiceAgentHybridIntegrated';
import { BookingData } from './types';

// Option 1: Direct API keys (development only)
export function VoiceAgentDirect() {
  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8 text-center">
          Запази час
        </h1>
        <VoiceAgentHybridIntegrated
          sonioxApiKey={process.env.REACT_APP_SONIOX_API_KEY}
          openaiApiKey={process.env.REACT_APP_OPENAI_API_KEY}
          elevenLabsApiKey={process.env.REACT_APP_ELEVENLABS_API_KEY}
          barbershopName="Blade & Bourbon"
          onBookingComplete={(booking) => {
            console.log('Booking complete:', booking);
            // Send to your API
            fetch('/api/bookings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(booking),
            });
          }}
        />
      </div>
    </div>
  );
}

// Option 2: Secure token endpoint (recommended for production)
export function VoiceAgentSecure() {
  const [session, setSession] = useState<{
    soniox?: { configured: boolean };
    openai?: { configured: boolean; apiKey: string };
    elevenlabs?: { configured: boolean; apiKey: string; defaultVoiceId: string };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/session/all')
      .then(r => r.json())
      .then(data => {
        setSession(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load session:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="text-white text-center">Зареждане...</div>;
  }

  if (!session?.openai?.configured) {
    return <div className="text-red-400 text-center">Грешка в конфигурацията</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8 text-center">
          Запази час
        </h1>
        <VoiceAgentHybridIntegrated
          sonioxApiKey={session.soniox?.configured ? 'proxy' : ''}
          openaiApiKey={session.openai.apiKey}
          elevenLabsApiKey={session.elevenlabs?.apiKey || ''}
          voiceId={session.elevenlabs?.defaultVoiceId}
          barbershopName="Blade & Bourbon"
        />
      </div>
    </div>
  );
}

// Option 3: With custom services
export function VoiceAgentCustom() {
  const customServices = [
    {
      id: 'premium-haircut',
      name: 'Premium Haircut',
      nameBg: 'Премиум подстригване',
      price: 60,
      duration: 45,
      description: 'Haircut with hot towel treatment',
      descriptionBg: 'Подстригване с гореща кърпа',
    },
    {
      id: 'royal-shave',
      name: 'Royal Shave',
      nameBg: 'Кралско бръснене',
      price: 50,
      duration: 35,
      description: 'Full straight razor experience',
      descriptionBg: 'Пълно бръснене с прав бръснач',
    },
  ];

  return (
    <VoiceAgentHybridIntegrated
      sonioxApiKey={process.env.REACT_APP_SONIOX_API_KEY}
      openaiApiKey={process.env.REACT_APP_OPENAI_API_KEY}
      elevenLabsApiKey={process.env.REACT_APP_ELEVENLABS_API_KEY}
      services={customServices}
      barbershopName="Royal Barber Sofia"
    />
  );
}

// Option 4: Simple embedded version
export function EmbeddedVoiceAgent() {
  const [showAgent, setShowAgent] = useState(false);

  return (
    <div className="p-4">
      {!showAgent ? (
        <button
          onClick={() => setShowAgent(true)}
          className="bg-amber-500 text-white px-6 py-3 rounded-full font-semibold hover:bg-amber-600 transition"
        >
          🎙️ Гласов асистент
        </button>
      ) : (
        <div className="relative">
          <button
            onClick={() => setShowAgent(false)}
            className="absolute -top-2 -right-2 bg-red-500 text-white w-8 h-8 rounded-full"
          >
            ×
          </button>
          <VoiceAgentHybridIntegrated
            sonioxApiKey={process.env.REACT_APP_SONIOX_API_KEY}
            openaiApiKey={process.env.REACT_APP_OPENAI_API_KEY}
            elevenLabsApiKey={process.env.REACT_APP_ELEVENLABS_API_KEY}
          />
        </div>
      )}
    </div>
  );
}

// Full page example with header and footer
export function VoiceAgentPage() {
  const [completedBooking, setCompletedBooking] = useState<BookingData | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      {/* Header */}
      <header className="bg-black/50 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✂️</span>
            <h1 className="text-2xl font-bold text-white">Blade & Bourbon</h1>
          </div>
          <nav className="flex gap-6 text-gray-400">
            <a href="#services" className="hover:text-white transition">Услуги</a>
            <a href="#booking" className="hover:text-white transition">Запази час</a>
            <a href="#contact" className="hover:text-white transition">Контакти</a>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left: Info */}
          <div className="text-white">
            <h2 className="text-5xl font-bold mb-6">
              Гласова резервация
            </h2>
            <p className="text-xl text-gray-400 mb-8">
              Запазете час бързо и лесно с нашия AI асистент. 
              Просто говорете на български!
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center text-sm">✓</span>
                <span>Без чакане на телефона</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center text-sm">✓</span>
                <span>Достъпно 24/7</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center text-sm">✓</span>
                <span>Моментално потвърждение</span>
              </div>
            </div>
          </div>

          {/* Right: Voice Agent */}
          <div id="booking">
            {completedBooking ? (
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-8 text-center">
                <div className="text-6xl mb-4">✅</div>
                <h3 className="text-2xl font-bold text-green-400 mb-2">
                  Резервацията е потвърдена!
                </h3>
                <p className="text-gray-400 mb-6">
                  Очакваме ви на {completedBooking.dateTime}
                </p>
                <button
                  onClick={() => setCompletedBooking(null)}
                  className="text-amber-400 hover:text-amber-300"
                >
                  Нова резервация →
                </button>
              </div>
            ) : (
              <VoiceAgentHybridIntegrated
                sonioxApiKey={process.env.REACT_APP_SONIOX_API_KEY}
                openaiApiKey={process.env.REACT_APP_OPENAI_API_KEY}
                elevenLabsApiKey={process.env.REACT_APP_ELEVENLABS_API_KEY}
                barbershopName="Blade & Bourbon"
                onBookingComplete={setCompletedBooking}
              />
            )}
          </div>
        </div>

        {/* Services */}
        <section id="services" className="mt-24">
          <h3 className="text-3xl font-bold text-white text-center mb-12">Нашите услуги</h3>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: '💈', name: 'Подстригване', price: '40 лв' },
              { icon: '🪒', name: 'Бръснене', price: '35 лв' },
              { icon: '✨', name: 'Комбо', price: '65 лв' },
              { icon: '🧔', name: 'Брада', price: '25 лв' },
            ].map((service) => (
              <div key={service.name} className="bg-white/5 rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">{service.icon}</div>
                <h4 className="text-white font-semibold mb-1">{service.name}</h4>
                <p className="text-amber-400">{service.price}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-24 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-500">
          <p>ул. "Шишман" 18, София | Пон-Нед: 10:00-20:00</p>
        </div>
      </footer>
    </div>
  );
}

export default VoiceAgentPage;
