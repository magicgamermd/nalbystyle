// VoiceAgentHybrid.tsx - Main component for Bulgarian Barbershop Voice Agent
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useSonioxSTT } from './hooks/useSonioxSTT';
import { useElevenLabsTTS } from './hooks/useElevenLabsTTS';
import { useConversation } from './hooks/useConversation';
import { ConversationState, BookingData } from './types';

interface VoiceAgentHybridProps {
  sonioxApiKey?: string;
  openaiApiKey?: string;
  elevenLabsApiKey?: string;
  voiceId?: string;
  className?: string;
}

export const VoiceAgentHybrid: React.FC<VoiceAgentHybridProps> = ({
  sonioxApiKey,
  openaiApiKey,
  elevenLabsApiKey,
  voiceId = 'JBFqnCBsd6RMkjVDRZzb', // Default Bulgarian-friendly voice
  className = '',
}) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const vadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  const {
    bookingData,
    currentStep,
    conversationHistory,
    updateBookingData,
    getNextQuestion,
    resetConversation,
    isComplete,
  } = useConversation();

  const { startCapture, stopCapture, audioStream, isCapturing } = useAudioCapture();
  
  const { 
    connect: connectSoniox, 
    disconnect: disconnectSoniox, 
    isConnected: isSonioxConnected,
    lastTranscript,
    isFinal,
  } = useSonioxSTT({
    apiKey: sonioxApiKey,
    language: 'bg', // Bulgarian
    onTranscript: handleTranscript,
    onFinal: handleFinalTranscript,
  });

  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    audioRef,
  } = useElevenLabsTTS({
    apiKey: elevenLabsApiKey,
    voiceId,
    modelId: 'eleven_multilingual_v2',
    onStart: () => setStatus('speaking'),
    onEnd: () => {
      setStatus('listening');
      isProcessingRef.current = false;
    },
  });

  // VAD (Voice Activity Detection) - detect silence
  function handleTranscript(text: string, isFinalResult: boolean) {
    setTranscript(text);
    
    // Reset VAD timeout on new speech
    if (vadTimeoutRef.current) {
      clearTimeout(vadTimeoutRef.current);
    }

    // If we have substantial text and it's not final yet, set up pause detection
    if (text.length > 5 && !isFinalResult && !isProcessingRef.current) {
      vadTimeoutRef.current = setTimeout(() => {
        // User paused - treat as end of utterance
        handleFinalTranscript(text);
      }, 1500); // 1.5 second pause threshold
    }
  }

  async function handleFinalTranscript(text: string) {
    if (isProcessingRef.current || !text.trim()) return;
    
    isProcessingRef.current = true;
    setStatus('processing');
    
    // Stop listening temporarily while processing
    await stopCapture();

    try {
      // Get GPT-4o response
      const response = await getGPT4oResponse(text);
      
      // Parse response and update booking data if needed
      parseAndUpdateBookingData(text, response);
      
      // Speak the response
      await speak(response);
      
    } catch (error) {
      console.error('Error processing transcript:', error);
      setStatus('idle');
      isProcessingRef.current = false;
    }
  }

  async function getGPT4oResponse(userInput: string): Promise<string> {
    const systemPrompt = `Ти си виртуален асистент за барбершоп "Blade & Bourbon" в София, България.

Текуща стъпка на разговора: ${currentStep}

Събрана информация досега:
${JSON.stringify(bookingData, null, 2)}

Инструкции:
1. Говори само на български език
2. Бъди учтив и професионален
3. Разбери каква услуга иска клиентът (подстригване, бръснене, комбо)
4. Събери: желана услуга, дата и час, име, телефон
5. Потвърди резервацията
6. Ако липсва информация, попитай за нея
7. Отговаряй кратко и ясно

Услуги и цени:
- Подстригване - 40 лв
- Класическо бръснене - 35 лв  
- Комбо (подстригване + бръснене) - 65 лв
- Оформяне на брада - 25 лв

Работно време: Понеделник-Неделя 10:00-20:00
Адрес: ул. "Шишман" 18, София`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map(h => ({ 
            role: h.role as 'user' | 'assistant', 
            content: h.content 
          })),
          { role: 'user', content: userInput },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  function parseAndUpdateBookingData(userInput: string, aiResponse: string) {
    // Simple extraction logic - in production, use structured extraction
    const lowerInput = userInput.toLowerCase();
    
    // Service detection
    if (!bookingData.service) {
      if (lowerInput.includes('подстригване') || lowerInput.includes('коса')) {
        updateBookingData({ service: 'Подстригване', price: 40 });
      } else if (lowerInput.includes('бръснене') || lowerInput.includes('брада')) {
        if (lowerInput.includes('комбо') || lowerInput.includes('и')) {
          updateBookingData({ service: 'Комбо', price: 65 });
        } else {
          updateBookingData({ service: 'Класическо бръснене', price: 35 });
        }
      }
    }
    
    // Date/Time detection (simplified - would need proper date parsing)
    if (!bookingData.dateTime) {
      const dateMatch = userInput.match(/(\d{1,2})[./\s](\d{1,2})[./\s]?(\d{2,4})?/);
      const timeMatch = userInput.match(/(\d{1,2})[:\s](\d{2})\s*(часа?)?/);
      
      if (dateMatch || timeMatch) {
        updateBookingData({ 
          dateTime: userInput, // Store raw, parse properly in production
        });
      }
    }
    
    // Phone detection
    if (!bookingData.phone) {
      const phoneMatch = userInput.match(/(\+?359|0)\s*[\d\s-]{8,12}/);
      if (phoneMatch) {
        updateBookingData({ phone: phoneMatch[0].replace(/\s/g, '') });
      }
    }
    
    // Name detection (simplified)
    if (!bookingData.name && currentStep === 'name') {
      // Assume the whole input is the name if we're at name step
      updateBookingData({ name: userInput.trim() });
    }
  }

  // Barge-in support - stop speaking when user starts talking
  useEffect(() => {
    if (isSpeaking && transcript && transcript !== lastTranscript) {
      stopSpeaking();
      // Restart capture for new input
      if (audioStream) {
        startCapture();
      }
    }
  }, [transcript, isSpeaking]);

  const startSession = useCallback(async () => {
    setIsActive(true);
    setStatus('listening');
    
    // Get initial greeting
    const greeting = await getGPT4oResponse('');
    await speak(greeting);
    
    // Start audio capture
    await startCapture();
    await connectSoniox();
  }, []);

  const stopSession = useCallback(async () => {
    setIsActive(false);
    setStatus('idle');
    setTranscript('');
    
    await stopCapture();
    await disconnectSoniox();
    await stopSpeaking();
    
    if (vadTimeoutRef.current) {
      clearTimeout(vadTimeoutRef.current);
    }
    
    resetConversation();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  return (
    <div className={`voice-agent-hybrid ${className}`}>
      <div className="voice-agent-container">
        {/* Status indicator */}
        <div className={`status-indicator status-${status}`}>
          <div className="status-pulse"></div>
          <span className="status-text">
            {status === 'idle' && 'Готов да започне'}
            {status === 'listening' && 'Слушам...'}
            {status === 'processing' && 'Обработвам...'}
            {status === 'speaking' && 'Говоря...'}
          </span>
        </div>

        {/* Transcript display */}
        {transcript && (
          <div className="transcript-box">
            <p className="transcript-text">{transcript}</p>
          </div>
        )}

        {/* Conversation progress */}
        <div className="conversation-progress">
          <div className={`step ${currentStep === 'service' ? 'active' : ''} ${bookingData.service ? 'completed' : ''}`}>
            <span className="step-icon">💈</span>
            <span className="step-label">Услуга</span>
          </div>
          <div className={`step ${currentStep === 'datetime' ? 'active' : ''} ${bookingData.dateTime ? 'completed' : ''}`}>
            <span className="step-icon">📅</span>
            <span className="step-label">Дата/Час</span>
          </div>
          <div className={`step ${currentStep === 'name' ? 'active' : ''} ${bookingData.name ? 'completed' : ''}`}>
            <span className="step-icon">👤</span>
            <span className="step-label">Име</span>
          </div>
          <div className={`step ${currentStep === 'phone' ? 'active' : ''} ${bookingData.phone ? 'completed' : ''}`}>
            <span className="step-icon">📞</span>
            <span className="step-label">Телефон</span>
          </div>
          <div className={`step ${currentStep === 'confirmation' ? 'active' : ''} ${isComplete ? 'completed' : ''}`}>
            <span className="step-icon">✅</span>
            <span className="step-label">Потвърждение</span>
          </div>
        </div>

        {/* Control button */}
        <button
          onClick={isActive ? stopSession : startSession}
          className={`control-button ${isActive ? 'active' : ''}`}
          disabled={status === 'processing'}
        >
          {isActive ? (
            <>
              <span className="button-icon">⏹</span>
              <span>Спри разговора</span>
            </>
          ) : (
            <>
              <span className="button-icon">🎤</span>
              <span>Започни разговор</span>
            </>
          )}
        </button>

        {/* Booking summary */}
        {isComplete && (
          <div className="booking-summary">
            <h3>Вашата резервация</h3>
            <ul>
              <li><strong>Услуга:</strong> {bookingData.service}</li>
              <li><strong>Дата и час:</strong> {bookingData.dateTime}</li>
              <li><strong>Име:</strong> {bookingData.name}</li>
              <li><strong>Телефон:</strong> {bookingData.phone}</li>
              {bookingData.price && (
                <li><strong>Цена:</strong> {bookingData.price} лв</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Hidden audio element for TTS */}
      <audio ref={audioRef} style={{ display: 'none' }} />

      <style>{`
        .voice-agent-hybrid {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 500px;
          margin: 0 auto;
          padding: 20px;
        }

        .voice-agent-container {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border-radius: 20px;
          padding: 30px;
          color: #fff;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }

        .status-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 20px;
          padding: 15px;
          border-radius: 12px;
          background: rgba(255,255,255,0.05);
        }

        .status-pulse {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #4ade80;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }

        .status-listening .status-pulse { background: #fbbf24; animation: pulse 1s infinite; }
        .status-processing .status-pulse { background: #60a5fa; animation: spin 1s linear infinite; }
        .status-speaking .status-pulse { background: #a78bfa; animation: pulse 1.5s infinite; }
        .status-idle .status-pulse { background: #9ca3af; animation: none; }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .transcript-box {
          background: rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 15px;
          margin-bottom: 20px;
          min-height: 60px;
        }

        .transcript-text {
          margin: 0;
          font-size: 16px;
          line-height: 1.5;
          color: #e5e7eb;
        }

        .conversation-progress {
          display: flex;
          justify-content: space-between;
          margin-bottom: 25px;
          padding: 0 10px;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          opacity: 0.4;
          transition: opacity 0.3s;
        }

        .step.active { opacity: 1; }
        .step.completed { opacity: 0.8; }
        .step.active .step-icon { transform: scale(1.2); }

        .step-icon {
          font-size: 24px;
          transition: transform 0.3s;
        }

        .step-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .control-button {
          width: 100%;
          padding: 16px 24px;
          font-size: 18px;
          font-weight: 600;
          border: none;
          border-radius: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.3s;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #fff;
        }

        .control-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(245, 158, 11, 0.4);
        }

        .control-button.active {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }

        .control-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .button-icon {
          font-size: 24px;
        }

        .booking-summary {
          margin-top: 25px;
          padding: 20px;
          background: rgba(74, 222, 128, 0.1);
          border-radius: 12px;
          border: 1px solid rgba(74, 222, 128, 0.3);
        }

        .booking-summary h3 {
          margin: 0 0 15px 0;
          color: #4ade80;
        }

        .booking-summary ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .booking-summary li {
          padding: 8px 0;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .booking-summary li:last-child {
          border-bottom: none;
        }
      `}</style>
    </div>
  );
};
