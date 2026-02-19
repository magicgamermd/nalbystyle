import React, { useState, useRef, useEffect, useCallback } from 'react';

const SONIOX_WS_URL = 'wss://api.soniox.com/transcribe';
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB/stream';

// Get API keys from Cloudflare Pages Function
const getApiKeys = async () => {
  const res = await fetch('/api-keys');
  return res.json();
};

type Status = 'idle' | 'listening' | 'processing' | 'speaking';

export const VoiceAgentHybrid: React.FC<{ shopName?: string }> = ({ shopName = 'Налби Стайл' }) => {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sonioxWsRef = useRef<WebSocket | null>(null);
  const currentTranscriptRef = useRef('');
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const apiKeysRef = useRef<{ soniox?: string; openai?: string; elevenlabs?: string }>({});
  const messagesRef = useRef<Array<{ role: string; content: string }>>([]);

  const isActive = status !== 'idle';

  // Get API keys on mount
  useEffect(() => {
    getApiKeys().then(keys => { apiKeysRef.current = keys; });
  }, []);

  // Build system prompt with current time
  const getSystemPrompt = useCallback(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Sofia' });
    const dayNames = ['неделя','понеделник','вторник','сряда','четвъртък','петък','събота'];
    const dayName = dayNames[now.getDay()];
    
    return `Ти си гласов асистент на бръснарница "${shopName}" в град Троян, България.

СТИЛ: Говори САМО на български. Кратки отговори — 1–2 изречения. Приятелски тон, като готин приятел.

ИНФО ЗА САЛОНА:
- Работно време: Пон–Съб 09:00–19:00, Неделя — почивен ден
- Адрес: ул. Васил Левски 45, Троян
- Сега е ${dayName}, ${timeStr} часа
- Услуги: подстригване мъже (20лв), бръснене (15лв), комбо подстригване+бръснене (30лв), оформяне на брада (12лв), детско подстригване до 12г (15лв)

ЗАПИСВАНЕ НА ЧАС (следвай стъпките една по една):
1. Питай за УСЛУГА
2. Питай за ПРЕДПОЧИТАН ДЕН И ЧАС
3. Питай за ИМЕ
4. Питай за ТЕЛЕФОНЕН НОМЕР

ТЕЛЕФОНЕН НОМЕР — КРИТИЧНО:
- Българските номера имат 10 цифри (започват с 08)
- Ако чуеш по-малко от 10 цифри, попитай: "Останалите цифри?"
- ВИНАГИ повтори номера цифра по цифра: "Значи нула осем седем девет, нула шест нула, осем едно три — правилно ли е?"

5. Обобщи записването и потвърди`;
  }, [shopName]);

  // Send to GPT-4o and speak response
  const processAndSpeak = useCallback(async (text: string) => {
    setStatus('processing');
    
    try {
      // Add user message to conversation history
      messagesRef.current.push({ role: 'user', content: text });
      
      // 1. GPT-4o response with full conversation history
      const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKeysRef.current.openai}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: getSystemPrompt() },
            ...messagesRef.current,
          ],
          temperature: 0.7,
          max_tokens: 150,
        }),
      });
      
      const gptData = await gptRes.json();
      const response = gptData.choices[0].message.content;
      
      // Save assistant response to conversation history
      messagesRef.current.push({ role: 'assistant', content: response });

      // 2. ElevenLabs TTS
      setStatus('speaking');
      const ttsRes = await fetch(ELEVENLABS_URL, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKeysRef.current.elevenlabs || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: response,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.35, similarity_boost: 0.85, style: 0.4 },
        }),
      });

      // Play audio
      const audioBlob = await ttsRes.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setStatus('listening');
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
      
    } catch (err) {
      console.error(err);
      setStatus('listening');
    }
  }, [shopName]);

  // Handle silence - user stopped speaking
  const onSilence = useCallback(() => {
    if (currentTranscriptRef.current.trim().length > 5) {
      const text = currentTranscriptRef.current;
      currentTranscriptRef.current = '';
      setTranscript('');
      
      // Stop recording temporarily
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      
      processAndSpeak(text).then(() => {
        // Resume listening after speaking
        startRecording();
      });
    }
  }, [processAndSpeak]);

  // Start Soniox WebSocket and recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Connect to Soniox
      const ws = new WebSocket(`${SONIOX_WS_URL}?auth=${apiKeysRef.current.soniox}`);
      sonioxWsRef.current = ws;
      
      ws.onopen = () => {
        // Start transcription session
        ws.send(JSON.stringify({
          type: 'start',
          language: 'bg',
          enable_automatic_punctuation: true,
        }));
      };
      
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'transcript' && data.text) {
          currentTranscriptRef.current = data.text;
          setTranscript(data.text);
          
          // Reset silence timer
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(onSilence, 1500);
        }
      };
      
      // Record and stream to Soniox
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };
      
      mediaRecorder.start(100); // 100ms chunks
      setStatus('listening');
      
    } catch (err) {
      console.error(err);
      setError('Няма достъп до микрофона');
    }
  }, [onSilence]);

  // Start call
  const startCall = useCallback(async () => {
    setError(null);
    currentTranscriptRef.current = '';
    messagesRef.current = []; // Reset conversation history
    
    // 1. Request mic permission FIRST (before anything else!)
    try {
      const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testStream.getTracks().forEach(t => t.stop()); // Release immediately, just need permission
    } catch {
      setError('Няма достъп до микрофона');
      return;
    }
    
    // 2. Get API keys
    if (!apiKeysRef.current.soniox) {
      await getApiKeys().then(keys => { apiKeysRef.current = keys; });
    }
    
    // 3. Welcome message (mic already permitted)
    setStatus('speaking');
    const welcome = `Здрасти! ${shopName} — казвай.`;
    
    const ttsRes = await fetch(ELEVENLABS_URL, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKeysRef.current.elevenlabs || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: welcome,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.35, similarity_boost: 0.85 },
      }),
    });
    
    const audioBlob = await ttsRes.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      startRecording();
    };
    await audio.play();
    
  }, [shopName, startRecording]);

  // Stop call
  const stopCall = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    sonioxWsRef.current?.close();
    setStatus('idle');
    setTranscript('');
    currentTranscriptRef.current = '';
  }, []);

  const statusLabel = { idle: shopName, listening: 'Слушам...', processing: 'Мисля...', speaking: 'Говоря...' }[status];

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-center gap-2">
      {error && <div className="bg-red-900/80 text-red-200 text-xs px-3 py-1 rounded-full">{error}</div>}
      {isActive && (
        <div className="bg-dark-800/90 text-gold-400 text-xs px-3 py-1 rounded-full border border-gold-500/30">
          {statusLabel}
          {transcript && <span className="ml-2 text-gold-600">„{transcript.slice(-30)}“</span>}
        </div>
      )}
      <button
        onClick={isActive ? stopCall : startCall}
        className="relative w-16 h-16 rounded-full flex items-center justify-center focus:outline-none"
      >
        <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          status === 'listening' ? 'bg-gold-500/40 border border-gold-500/70 animate-pulse' :
          status === 'speaking' ? 'bg-blue-500/40 border border-blue-500/70' :
          isActive ? 'bg-red-600/80' : 'bg-gold-500/20 border border-gold-500/50'
        }`}>
          {isActive ? (
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
