// hooks/useSonioxSTT.ts - Hook for Soniox WebSocket streaming STT
import { useState, useRef, useCallback, useEffect } from 'react';

interface UseSonioxSTTOptions {
  apiKey: string;
  language?: string;
  sampleRate?: number;
  enablePunctuation?: boolean;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onFinal?: (text: string) => void;
  onError?: (error: Error) => void;
}

interface UseSonioxSTTReturn {
  connect: () => Promise<void>;
  disconnect: () => void;
  sendAudio: (audioData: Int16Array) => void;
  isConnected: boolean;
  isConnecting: boolean;
  lastTranscript: string;
  isFinal: boolean;
  error: Error | null;
}

export function useSonioxSTT(options: UseSonioxSTTOptions): UseSonioxSTTReturn {
  const {
    apiKey,
    language = 'bg',
    sampleRate = 16000,
    enablePunctuation = true,
    onTranscript,
    onFinal,
    onError,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [isFinal, setIsFinal] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamSidRef = useRef<string>('');
  const accumulatedTextRef = useRef<string>('');

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[useSonioxSTT] Already connected');
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      // Soniox WebSocket endpoint
      const wsUrl = `wss://api.soniox.com/transcribe-websocket?api_key=${apiKey}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useSonioxSTT] WebSocket connected');
        
        // Send configuration message
        const config = {
          type: 'config',
          config: {
            sample_rate: sampleRate,
            language: language,
            enable_punctuation: enablePunctuation,
            enable_speaker_diarization: false,
            model: 'precision', // or 'fast' for lower latency
          },
        };
        
        ws.send(JSON.stringify(config));
        setIsConnected(true);
        setIsConnecting(false);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connected':
              streamSidRef.current = message.stream_sid;
              console.log('[useSonioxSTT] Stream started:', message.stream_sid);
              break;

            case 'transcript':
              const { text, is_final, speech_final } = message;
              
              if (text) {
                setLastTranscript(text);
                setIsFinal(is_final || speech_final);
                
                if (is_final || speech_final) {
                  accumulatedTextRef.current = text;
                  onFinal?.(text);
                }
                
                onTranscript?.(text, is_final || speech_final);
              }
              break;

            case 'error':
              const errorMsg = message.message || 'Unknown Soniox error';
              console.error('[useSonioxSTT] Server error:', errorMsg);
              setError(new Error(errorMsg));
              onError?.(new Error(errorMsg));
              break;

            default:
              console.log('[useSonioxSTT] Unknown message type:', message.type);
          }
        } catch (err) {
          console.error('[useSonioxSTT] Error parsing message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('[useSonioxSTT] WebSocket error:', error);
        const err = new Error('WebSocket connection error');
        setError(err);
        onError?.(err);
      };

      ws.onclose = (event) => {
        console.log('[useSonioxSTT] WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        
        if (event.code !== 1000 && event.code !== 1001) {
          const err = new Error(`Connection closed unexpectedly: ${event.code}`);
          setError(err);
          onError?.(err);
        }
      };

    } catch (err) {
      setIsConnecting(false);
      const error = err instanceof Error ? err : new Error('Failed to connect');
      setError(error);
      onError?.(error);
      throw error;
    }
  }, [apiKey, language, sampleRate, enablePunctuation, onTranscript, onFinal, onError]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      // Send end-of-stream marker
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'end_stream' }));
      }
      
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setLastTranscript('');
    setIsFinal(false);
    accumulatedTextRef.current = '';
  }, []);

  const sendAudio = useCallback((audioData: Int16Array) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Convert Int16Array to base64
      const base64Audio = int16ToBase64(audioData);
      
      wsRef.current.send(JSON.stringify({
        type: 'audio',
        data: base64Audio,
      }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    sendAudio,
    isConnected,
    isConnecting,
    lastTranscript,
    isFinal,
    error,
  };
}

// Helper function to convert Int16Array to base64
function int16ToBase64(int16Array: Int16Array): string {
  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = '';
  const len = uint8Array.byteLength;
  
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  
  return btoa(binary);
}

// Helper function to resample audio if needed
export function resampleAudio(
  audioData: Float32Array,
  fromSampleRate: number,
  toSampleRate: number
): Float32Array {
  if (fromSampleRate === toSampleRate) {
    return audioData;
  }

  const ratio = toSampleRate / fromSampleRate;
  const newLength = Math.round(audioData.length * ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const position = i / ratio;
    const index = Math.floor(position);
    const fraction = position - index;

    if (index < audioData.length - 1) {
      result[i] = audioData[index] * (1 - fraction) + audioData[index + 1] * fraction;
    } else {
      result[i] = audioData[index];
    }
  }

  return result;
}
