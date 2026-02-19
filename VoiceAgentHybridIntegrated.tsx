// VoiceAgentHybridIntegrated.tsx - Fully integrated version with audio streaming
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAudioCapture, float32ToInt16 } from './hooks/useAudioCapture';
import { useSonioxSTT } from './hooks/useSonioxSTT';
import { useElevenLabsTTS } from './hooks/useElevenLabsTTS';
import { useConversation } from './hooks/useConversation';
import { ConversationStep, BookingData, ServiceOption, SERVICES } from './types';

interface VoiceAgentHybridIntegratedProps {
  sonioxApiKey?: string;
  openaiApiKey?: string;
  elevenLabsApiKey?: string;
  voiceId?: string;
  className?: string;
  onBookingComplete?: (bookingData: BookingData) => void;
  barbershopName?: string;
  services?: ServiceOption[];
}

export const VoiceAgentHybridIntegrated: React.FC<VoiceAgentHybridIntegratedProps> = ({
  sonioxApiKey = '',
  openaiApiKey = '',
  elevenLabsApiKey = '',
  voiceId = 'JBFqnCBsd6RMkjVDRZzb',
  className = '',
  onBookingComplete,
  barbershopName = 'Blade & Bourbon',
  services = SERVICES,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking' | 'error'>('idle');
  const [transcript, setTranscript] = useState('');
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const vadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const {
    bookingData,
    currentStep,
    conversationHistory,
    updateBookingData,
    addMessage,
    resetConversation,
    isComplete,
    detectService,
    detectDateTime,
    detectPhone,
  } = useConversation();

  const { startCapture, stopCapture, audioStream, isCapturing, audioContext, analyserNode } = useAudioCapture({
    sampleRate: 16000,
    bufferSize: 2048,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  });
  
  const { 
    connect: connectSoniox, 
    disconnect: disconnectSoniox, 
    isConnected: isSonioxConnected,
    sendAudio,
  } = useSonioxSTT({
    apiKey: sonioxApiKey,
    language: 'bg',
    sampleRate: 16000,
    enablePunctuation: true,
    onTranscript: (text, isFinal) => {
      setCurrentTranscript(text);
      handleVoiceActivity(text, isFinal);
    },
    onFinal: (text) => {
      handleFinalTranscript(text);
    },
    onError: (err) => {
      setError(`STT Error: ${err.message}`);
      setStatus('error');
    },
  });

  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    isLoading: isTTLoading,
    audioRef,
  } = useElevenLabsTTS({
    apiKey: elevenLabsApiKey,
    voiceId,
    modelId: 'eleven_multilingual_v2',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    onStart: () => setStatus('speaking'),
    onEnd: () => {
      setStatus('listening');
      isProcessingRef.current = false;
      // Resume listening
      if (isActive) {
        resumeAudioProcessing();
      }
    },
  });

  // VAD (Voice Activity Detection) with audio level monitoring
  useEffect(() => {
    if (!isCapturing || !analyserNode || !isActive) return;

    analyserRef.current = analyserNode;
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    
    const checkAudioLevel = () => {
      if (!analyserRef.current || !isActive) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const normalizedLevel = Math.min(average / 128, 1);
      setAudioLevel(normalizedLevel);
      
      // Check for silence (barge-in detection)
      if (isSpeaking && normalizedLevel > 0.3) {
        // User is speaking while AI is speaking - barge in
        handleBargeIn();
      }
      
      requestAnimationFrame(checkAudioLevel);
    };
    
    const animationId = requestAnimationFrame(checkAudioLevel);
    return () => cancelAnimationFrame(animationId);
  }, [isCapturing, analyserNode, isActive, isSpeaking]);

  // Set up audio streaming to Soniox
  useEffect(() => {
    if (!isActive || !audioStream || !audioContext) return;

    const source = audioContext.createMediaStreamSource(audioStream);
    const processor = audioContext.createScriptProcessor(2048, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (!isActive || isProcessingRef.current) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      const int16Data = float32ToInt16(inputData);
      sendAudio(int16Data);
    };
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    audioProcessorRef.current = processor;

    return () => {
      processor.disconnect();
      source.disconnect();
    };
  }, [isActive, audioStream, audioContext, sendAudio]);

  function handleVoiceActivity(text: string, isFinal: boolean) {
    // Reset silence detection
    if (vadTimeoutRef.current) {
      clearTimeout(vadTimeoutRef.current);
    }

    // If we have text and user paused, trigger processing
    if (text.length > 3 && !isFinal && !isProcessingRef.current) {
      vadTimeoutRef.current = setTimeout(() => {
        handleFinalTranscript(text);
      }, 1200); // 1.2s pause threshold
    }
  }

  function handleBargeIn() {
    if (isSpeaking) {
      console.log('[Barge-in] User interrupted, stopping speech...');
      stopSpeaking();
      isProcessingRef.current = false;
      setStatus('listening');
    }
  }

  async function handleFinalTranscript(text: string) {
    if (isProcessingRef.current || !text.trim()) return;
    
    isProcessingRef.current = true;
    setStatus('processing');
    setTranscript(text);
    addMessage('user', text);

    try {
      // Parse input for booking data
      parseUserInput(text);
      
      // Get GPT-4o response
      const response = await getGPT4oResponse(text);
      addMessage('assistant', response);
      
      // Check if booking is complete
      if (isComplete) {
        onBookingComplete?.(bookingData);
      }
      
      // Speak the response
      await speak(response);
      
    } catch (error) {
      console.error('Error processing:', error);
      setError('Грешка при обработката. Опитайте отново.');
      setStatus('listening');
      isProcessingRef.current = false;
    }
  }

  function parseUserInput(input: string) {
    const lowerInput = input.toLowerCase();
    
    // Service detection
    if (!bookingData.service) {
      const detectedService = detectService(input);
      if (detectedService) {
        updateBookingData({ 
          service: detectedService.nameBg,
          price: detectedService.price 
        });
      }
    }
    
    // Date/time detection
    if (!bookingData.dateTime) {
      const detectedDateTime = detectDateTime(input);
      if (detectedDateTime) {
        updateBookingData({ dateTime: input }); // Store full input for GPT to parse
      }
    }
    
    // Phone detection
    if (!bookingData.phone) {
      const detectedPhone = detectPhone(input);
      if (detectedPhone) {
        updateBookingData({ phone: detectedPhone });
      }
    }
    
    // Name detection (if we're at name step and input is reasonable length)
    if (!bookingData.name && currentStep === 'name' && input.length > 2 && input.length < 50) {
      // Simple heuristic: if it doesn't look like a phone or date, it's probably a name
      if (!detectPhone(input) && !detectDateTime(input)) {
        updateBookingData({ name: input.trim() });
      }
    }
  }

  async function getGPT4oResponse(userInput: string): Promise<string> {
    const systemPrompt = `Ти си виртуален асистент за барбершоп "${barbershopName}" в София, България.

Текуща стъпка: ${currentStep}
Информация досега: ${JSON.stringify(bookingData)}

Услуги: ${services.map(s => `${s.nameBg} (${s.price} лв)`).join(', ')}

Инструкции:
1. Говори САМО на български
2. Бъди кратък (1-2 изречения)
3. Събери: услуга → дата/час → име → телефон
4. Ако липсва информация - попитай за нея
5. Потвърди накрая
6. Работно време: 10:00-20:00 всеки ден`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6).map(h => ({ 
        role: h.role as 'user' | 'assistant', 
        content: h.content 
      })),
      { role: 'user', content: userInput },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  function resumeAudioProcessing() {
    setStatus('listening');
  }

  const startSession = useCallback(async () => {
    try {
      setError(null);
      setIsActive(true);
      
      // Get initial greeting
      const greeting = `Здравейте! Аз съм вашият виртуален асистент за ${barbershopName}. С какво мога да ви помогна днес?`;
      
      // Start audio capture first
      await startCapture();
      
      // Connect to Soniox
      await connectSoniox();
      
      // Speak greeting
      await speak(greeting);
      
    } catch (err) {
      setError('Грешка при стартиране. Проверете микрофона.');
      setIsActive(false);
    }
  }, [barbershopName, startCapture, connectSoniox, speak]);

  const stopSession = useCallback(async () => {
    setIsActive(false);
    setStatus('idle');
    setTranscript('');
    setCurrentTranscript('');
    setAudioLevel(0);
    
    await stopCapture();
    await disconnectSoniox();
    await stopSpeaking();
    
    if (vadTimeoutRef.current) {
      clearTimeout(vadTimeoutRef.current);
    }
    
    resetConversation();
  }, [stopCapture, disconnectSoniox, stopSpeaking, resetConversation]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  return (
    <div className={`voice-agent ${className}`}>
      <div className="voice-agent-card">
        {/* Audio visualizer */}
        <div className="visualizer-container">
          <div 
            className={`audio-bar ${status === 'listening' ? 'active' : ''}`}
            style={{ transform: `scaleY(${0.1 + audioLevel * 0.9})` }}
          />
          <div 
            className={`audio-bar ${status === 'listening' ? 'active' : ''}`}
            style={{ transform: `scaleY(${0.1 + audioLevel * 0.7})`, animationDelay: '0.1s' }}
          />
          <div 
            className={`audio-bar ${status === 'listening' ? 'active' : ''}`}
            style={{ transform: `scaleY(${0.1 + audioLevel * 0.5})`, animationDelay: '0.2s' }}
          />
        </div>

        {/* Status */}
        <div className={`status-badge status-${status}`}>
          <div className="status-dot" />
          <span>
            {status === 'idle' && 'Готов'}
            {status === 'listening' && 'Слушам...'}
            {status === 'processing' && 'Мисля...'}
            {status === 'speaking' && 'Говоря...'}
            {status === 'error' && 'Грешка'}
          </span>
        </div>

        {/* Current transcript */}
        <div className="transcript-display">
          {currentTranscript && (
            <p className="transcript-live">{currentTranscript}</p>
          )}
          {transcript && transcript !== currentTranscript && (
            <p className="transcript-final">{transcript}</p>
          )}
        </div>

        {/* Progress steps */}
        <div className="booking-flow">
          {[
            { key: 'service', icon: '💈', label: 'Услуга' },
            { key: 'datetime', icon: '📅', label: 'Дата/Час' },
            { key: 'name', icon: '👤', label: 'Име' },
            { key: 'phone', icon: '📞', label: 'Телефон' },
          ].map((step, index) => (
            <div 
              key={step.key}
              className={`flow-step ${currentStep === step.key ? 'current' : ''} ${
                bookingData[step.key as keyof BookingData] ? 'done' : ''
              }`}
            >
              <span className="step-number">{index + 1}</span>
              <span className="step-icon">{step.icon}</span>
              <span className="step-name">{step.label}</span>
            </div>
          ))}
        </div>

        {/* Main button */}
        <button
          onClick={isActive ? stopSession : startSession}
          className={`main-button ${isActive ? 'stop' : 'start'} ${status}`}
          disabled={status === 'processing' || isTTLoading}
        >
          {isActive ? (
            <>
              <span className="btn-icon">■</span>
              <span>Спри</span>
            </>
          ) : (
            <>
              <span className="btn-icon">●</span>
              <span>Започни разговор</span>
            </>
          )}
        </button>

        {/* Error message */}
        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {/* Booking summary when complete */}
        {isComplete && (
          <div className="booking-complete">
            <h4>✅ Резервацията е готова!</h4>
            <div className="summary">
              <p><strong>{bookingData.service}</strong> - {bookingData.price} лв</p>
              <p>📅 {bookingData.dateTime}</p>
              <p>👤 {bookingData.name}</p>
              <p>📞 {bookingData.phone}</p>
            </div>
          </div>
        )}
      </div>

      <audio ref={audioRef} style={{ display: 'none' }} />

      <style>{`
        .voice-agent {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 420px;
          margin: 0 auto;
        }

        .voice-agent-card {
          background: linear-gradient(145deg, #1e1e2e 0%, #252538 100%);
          border-radius: 24px;
          padding: 28px;
          color: #fff;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        }

        .visualizer-container {
          display: flex;
          justify-content: center;
          align-items: flex-end;
          gap: 6px;
          height: 60px;
          margin-bottom: 20px;
        }

        .audio-bar {
          width: 8px;
          height: 40px;
          background: linear-gradient(to top, #f59e0b, #fbbf24);
          border-radius: 4px;
          transition: transform 0.1s ease;
          opacity: 0.3;
        }

        .audio-bar.active {
          opacity: 1;
          animation: pulse-bar 0.5s ease infinite alternate;
        }

        @keyframes pulse-bar {
          from { opacity: 0.7; }
          to { opacity: 1; }
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 20px;
          background: rgba(255,255,255,0.1);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: blink 1.5s infinite;
        }

        .status-idle .status-dot { background: #6b7280; animation: none; }
        .status-listening .status-dot { background: #22c55e; }
        .status-processing .status-dot { background: #3b82f6; }
        .status-speaking .status-dot { background: #a855f7; }
        .status-error .status-dot { background: #ef4444; animation: none; }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .transcript-display {
          min-height: 80px;
          background: rgba(0,0,0,0.2);
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .transcript-live {
          margin: 0;
          font-size: 16px;
          color: #fbbf24;
          font-style: italic;
        }

        .transcript-final {
          margin: 8px 0 0 0;
          font-size: 14px;
          color: #9ca3af;
          border-top: 1px solid rgba(255,255,255,0.1);
          padding-top: 8px;
        }

        .booking-flow {
          display: flex;
          justify-content: space-between;
          margin-bottom: 24px;
          padding: 0 8px;
        }

        .flow-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          opacity: 0.3;
          transition: all 0.3s;
        }

        .flow-step.current {
          opacity: 1;
          transform: scale(1.1);
        }

        .flow-step.done {
          opacity: 0.7;
        }

        .step-number {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
        }

        .flow-step.current .step-number {
          background: #f59e0b;
        }

        .flow-step.done .step-number {
          background: #22c55e;
        }

        .step-icon {
          font-size: 20px;
        }

        .step-name {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .main-button {
          width: 100%;
          padding: 18px;
          border: none;
          border-radius: 16px;
          font-size: 17px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.2s;
        }

        .main-button.start {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #fff;
        }

        .main-button.stop {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: #fff;
        }

        .main-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(245, 158, 11, 0.3);
        }

        .main-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-icon {
          font-size: 20px;
        }

        .error-message {
          margin-top: 16px;
          padding: 12px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          color: #fca5a5;
          font-size: 14px;
          text-align: center;
        }

        .booking-complete {
          margin-top: 20px;
          padding: 20px;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 16px;
          text-align: center;
        }

        .booking-complete h4 {
          margin: 0 0 12px 0;
          color: #22c55e;
        }

        .summary p {
          margin: 6px 0;
          color: #d1d5db;
        }
      `}</style>
    </div>
  );
};
