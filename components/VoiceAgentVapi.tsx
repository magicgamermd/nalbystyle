import React, { useState, useEffect, useRef, useCallback } from 'react';
import Vapi from '@vapi-ai/web';
import { Service, Barber } from '../types';

const VAPI_PUBLIC_KEY = '8f2f8757-976c-47bb-829f-e432cefe7bb5';
const VAPI_ASSISTANT_ID = '06d60879-6804-4690-b8d4-c0b67d29ac53';

interface VoiceAgentVapiProps {
  shopName?: string;
  services?: Service[];
  barbers?: Barber[];
}

// Orb particle config
const ORB_CONFIG = {
  particles: 80,
  baseRadius: 100,
  color: '212, 175, 55',
  glowColor: '255, 215, 0',
  idleSpeed: 0.005,
  speakSpeed: 0.05,
};

interface Particle {
  angle: number;
  speed: number;
  baseRadius: number;
  wobble: number;
  wobbleSpeed: number;
}

export const VoiceAgentVapi: React.FC<VoiceAgentVapiProps> = ({
  shopName = 'Налби Стайл',
  services = [],
  barbers = [],
}) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
  const [error, setError] = useState<string | null>(null);

  const vapiRef = useRef<Vapi | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const volumeRef = useRef<number>(0);

  // Init particles
  useEffect(() => {
    particlesRef.current = Array.from({ length: ORB_CONFIG.particles }, (_, i) => ({
      angle: (i / ORB_CONFIG.particles) * Math.PI * 2,
      speed: 0.002 + Math.random() * 0.003,
      baseRadius: ORB_CONFIG.baseRadius + Math.random() * 20 - 10,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
    }));
  }, []);

  // Canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      const isSpeaking = status === 'speaking';
      const vol = volumeRef.current;
      const speed = isSpeaking ? ORB_CONFIG.speakSpeed : ORB_CONFIG.idleSpeed;
      const energyBoost = isSpeaking ? 1 + vol * 60 : 1;

      // Glow
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, ORB_CONFIG.baseRadius * 1.5);
      grad.addColorStop(0, `rgba(${ORB_CONFIG.glowColor}, ${isActive ? 0.15 : 0.05})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, ORB_CONFIG.baseRadius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Particles
      particlesRef.current.forEach((p) => {
        p.angle += speed + p.speed;
        p.wobble += p.wobbleSpeed;
        const wobbleAmt = isSpeaking ? 20 * vol * 3 + 5 : 3;
        const r = p.baseRadius * energyBoost + Math.sin(p.wobble) * wobbleAmt;
        const x = cx + Math.cos(p.angle) * r;
        const y = cy + Math.sin(p.angle) * r;
        const alpha = isActive ? 0.7 + vol * 0.3 : 0.3;
        ctx.beginPath();
        ctx.arc(x, y, isSpeaking ? 2.5 : 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ORB_CONFIG.color}, ${alpha})`;
        ctx.fill();
      });

      // Center circle
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ORB_CONFIG.color}, ${isActive ? 0.15 : 0.08})`;
      ctx.fill();

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [isActive, status]);

  // Build dynamic system prompt with real services & barbers
  const buildSystemPrompt = useCallback(() => {
    const today = new Date().toLocaleDateString('bg-BG', {
      timeZone: 'Europe/Sofia',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const now = new Date().toLocaleTimeString('bg-BG', {
      timeZone: 'Europe/Sofia', hour: '2-digit', minute: '2-digit'
    });

    const servicesList = services.length > 0
      ? services.map(s => `- ${s.nameBg || s.name}: ${s.price} лв, ${s.duration} мин`).join('\n')
      : '- Подстригване: 25 лв, 30 мин\n- Брада: 20 лв, 20 мин\n- Подстригване + брада: 40 лв, 50 мин';

    const barbersList = barbers.length > 0
      ? barbers.map(b => `- ${b.nameBg || b.name} (id: ${b.id})`).join('\n')
      : '- (свали от системата)';

    return `Ти си Наби — гласовият асистент на ${shopName}. Говориш САМО на български. Отговаряш кратко и живо — като готин приятел, не като кол-център.

Днес е ${today}, часът е ${now}.

УСЛУГИ В САЛОНА:
${servicesList}

БРЪСНАРИ:
${barbersList}

РАБОТНО ВРЕМЕ: Понеделник-Петък 10:00-20:00, Събота 10:00-18:00, Неделя — почиваме.

КАК ЗАПИСВАШ ЧАС:
1. Разбери услугата
2. Питай за ден и час
3. Вземи името
4. Вземи телефона — повтори го цифра по цифра за потвърждение
5. Потвърди: "Готово! [Услуга] за [ден] в [час]. Чакаме те, [Име]!"

ТЕЛЕФОН — ВАЖНО:
- Събирай всички чути цифри (може да са групи: "089", "36", "9520")
- "20" в края = цифрите 2 и 0
- Когато имаш 9-10 цифри → повтори: "Значи: 0-8-9-3-6-9-5-9-2-0, така ли?"
- Само ако кажат НЕ → искай пак

СТИЛ: Максимум 1-2 изречения. Без "разбира се", "ще се радвам", и роботски фрази.`;
  }, [shopName, services, barbers]);

  const startCall = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    setIsActive(true);

    const vapi = new Vapi(VAPI_PUBLIC_KEY);
    vapiRef.current = vapi;

    vapi.on('call-start', () => setStatus('listening'));
    vapi.on('call-end', () => {
      setStatus('idle');
      setIsActive(false);
      vapiRef.current = null;
    });
    vapi.on('speech-start', () => setStatus('speaking'));
    vapi.on('speech-end', () => setStatus('listening'));
    vapi.on('volume-level', (level: number) => { volumeRef.current = level; });
    vapi.on('error', (err: unknown) => {
      console.error('Vapi error:', err);
      setError('Грешка при свързване. Опитай отново.');
      setStatus('idle');
      setIsActive(false);
      vapiRef.current = null;
    });

    try {
      await vapi.start(VAPI_ASSISTANT_ID);
    } catch (err) {
      console.error('Failed to start Vapi:', err);
      setError('Не може да се свърже. Провери микрофона.');
      setStatus('idle');
      setIsActive(false);
      vapiRef.current = null;
    }
  }, [shopName, buildSystemPrompt]);

  const stopCall = useCallback(() => {
    if (vapiRef.current) { vapiRef.current.stop(); vapiRef.current = null; }
    setStatus('idle');
    setIsActive(false);
  }, []);

  const statusLabel = {
    idle: shopName,
    connecting: 'Свързване...',
    listening: 'Слушам...',
    speaking: 'Говоря...',
  }[status];

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-center gap-2">
      {error && (
        <div className="bg-red-900/80 text-red-200 text-xs px-3 py-1 rounded-full max-w-[200px] text-center">
          {error}
        </div>
      )}
      {isActive && (
        <div className="bg-dark-800/90 text-gold-400 text-xs px-3 py-1 rounded-full border border-gold-500/30 backdrop-blur-sm">
          {statusLabel}
        </div>
      )}
      <button
        onClick={isActive ? stopCall : startCall}
        className="relative w-16 h-16 rounded-full flex items-center justify-center focus:outline-none"
        title={isActive ? 'Прекрати разговора' : 'Говори с асистента'}
      >
        <canvas
          ref={canvasRef}
          width={240}
          height={240}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: 'scale(1.5)' }}
        />
        <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
          isActive
            ? 'bg-red-600/80 hover:bg-red-500'
            : 'bg-gold-500/20 hover:bg-gold-500/40 border border-gold-500/50'
        }`}>
          {isActive ? (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gold-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-1 15.93V21h2v-2.07A7 7 0 0 0 19 12h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93z" />
            </svg>
          )}
        </div>
      </button>
      {!isActive && (
        <span className="text-gold-500/70 text-[10px] uppercase tracking-widest">{shopName}</span>
      )}
    </div>
  );
};
