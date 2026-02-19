import React, { useState, useRef, useEffect, useCallback } from 'react';

const TOKEN_URL = import.meta.env.DEV ? 'http://localhost:3002/session' : '/session';
const LOG_URL = import.meta.env.DEV ? '' : '/log';
const SESSION_ID = Math.random().toString(36).slice(2, 8);

function sendLog(role: string, text: string) {
  console.log(`[${role}]:`, text);
  if (LOG_URL) {
    fetch(LOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, text, sessionId: SESSION_ID }),
    }).catch(() => {});
  }
}

type Status = 'idle' | 'connecting' | 'listening' | 'speaking';

const ORB = { particles: 80, r: 90, color: '212,175,55' };

interface Particle { a: number; s: number; br: number; w: number; ws: number; }

export const VoiceAgentRealtime: React.FC<{ shopName?: string }> = ({ shopName = 'Налби Стайл' }) => {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const volRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  const isActive = status !== 'idle';

  // Init particles
  useEffect(() => {
    particlesRef.current = Array.from({ length: ORB.particles }, (_, i) => ({
      a: (i / ORB.particles) * Math.PI * 2,
      s: 0.002 + Math.random() * 0.003,
      br: ORB.r + Math.random() * 20 - 10,
      w: Math.random() * Math.PI * 2,
      ws: 0.02 + Math.random() * 0.03,
    }));
  }, []);

  // Orb canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const vol = volRef.current;
      const spk = status === 'speaking';
      const energy = spk ? 1 + vol * 50 : 1;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ORB.r * 1.5);
      g.addColorStop(0, `rgba(${ORB.color},${isActive ? 0.15 : 0.05})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, ORB.r * 1.8, 0, Math.PI * 2); ctx.fill();

      particlesRef.current.forEach(p => {
        p.a += (spk ? 0.05 : 0.005) + p.s;
        p.w += p.ws;
        const wAmt = spk ? 15 * vol * 3 + 4 : 3;
        const r = p.br * energy + Math.sin(p.w) * wAmt;
        const x = cx + Math.cos(p.a) * r, y = cy + Math.sin(p.a) * r;
        ctx.beginPath(); ctx.arc(x, y, spk ? 2.5 : 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ORB.color},${isActive ? 0.7 + vol * 0.3 : 0.25})`;
        ctx.fill();
      });

      ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ORB.color},${isActive ? 0.15 : 0.07})`; ctx.fill();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [isActive, status]);

  // Volume meter from remote audio
  const setupAnalyser = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    analyserRef.current = analyser;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      volRef.current = avg / 255;
      requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startCall = useCallback(async () => {
    setError(null);
    setStatus('connecting');

    try {
      // 1. Get ephemeral token
      const tokenRes = await fetch(TOKEN_URL);
      if (!tokenRes.ok) throw new Error('Token server error');
      const { client_secret } = await tokenRes.json();

      // 2. WebRTC setup
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Remote audio → speaker
      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;

      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
        setupAnalyser(e.streams[0]);
      };

      // Local mic → OpenAI
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getTracks().forEach(t => pc.addTrack(t, micStream));

      // Data channel for events
      const dc = pc.createDataChannel('oai-events');
      dc.onopen = () => {
        // Trigger assistant to speak first
        dc.send(JSON.stringify({ type: 'response.create' }));
      };
      dc.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.type === 'response.audio.delta') setStatus('speaking');
          if (ev.type === 'response.audio.done') setStatus('listening');
          if (ev.type === 'input_audio_buffer.speech_started') setStatus('listening');
          if (ev.type === 'session.created') setStatus('listening');

          // Transcript logging → server
          if (ev.type === 'conversation.item.input_audio_transcription.completed' && ev.transcript) {
            sendLog('USER', ev.transcript);
          }
          if (ev.type === 'response.audio_transcript.done' && ev.transcript) {
            sendLog('AGENT', ev.transcript);
          }
        } catch {}
      };

      // SDP handshake
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${client_secret.value}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        }
      );
      if (!sdpRes.ok) throw new Error(`SDP error ${sdpRes.status}`);
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setStatus('listening');
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Грешка при свързване');
      setStatus('idle');
    }
  }, [setupAnalyser]);

  const stopCall = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    if (audioRef.current) { audioRef.current.srcObject = null; audioRef.current = null; }
    analyserRef.current = null;
    volRef.current = 0;
    setStatus('idle');
    setError(null);
  }, []);

  const label = { idle: shopName, connecting: 'Свързване...', listening: 'Слушам...', speaking: 'Говоря...' }[status];

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-center gap-2">
      {error && (
        <div className="bg-red-900/80 text-red-200 text-xs px-3 py-1 rounded-full max-w-[200px] text-center">
          {error}
        </div>
      )}
      {isActive && (
        <div className="bg-dark-800/90 text-gold-400 text-xs px-3 py-1 rounded-full border border-gold-500/30 backdrop-blur-sm">
          {label}
        </div>
      )}
      <button
        onClick={isActive ? stopCall : startCall}
        className="relative w-16 h-16 rounded-full flex items-center justify-center focus:outline-none"
        title={isActive ? 'Прекрати' : 'Говори с Наби'}
      >
        <canvas
          ref={canvasRef}
          width={240} height={240}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: 'scale(1.5)' }}
        />
        <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          status === 'connecting' ? 'bg-gold-500/30 border border-gold-500/70' :
          isActive ? 'bg-red-600/80 hover:bg-red-500' : 'bg-gold-500/20 hover:bg-gold-500/40 border border-gold-500/50'
        }`}>
          {status === 'connecting' ? (
            <svg className="w-6 h-6 text-gold-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          ) : isActive ? (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1"/>
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gold-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-1 15.93V21h2v-2.07A7 7 0 0 0 19 12h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93z"/>
            </svg>
          )}
        </div>
      </button>
      {!isActive && <span className="text-gold-500/70 text-[10px] uppercase tracking-widest">{shopName}</span>}
    </div>
  );
};
