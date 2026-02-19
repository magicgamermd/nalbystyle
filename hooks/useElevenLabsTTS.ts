// hooks/useElevenLabsTTS.ts - Hook for ElevenLabs streaming TTS
import { useState, useRef, useCallback, useEffect } from 'react';

interface UseElevenLabsTTSOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

interface UseElevenLabsTTSReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  error: Error | null;
  audioRef: React.RefObject<HTMLAudioElement>;
}

export function useElevenLabsTTS(options: UseElevenLabsTTSOptions): UseElevenLabsTTSReturn {
  const {
    apiKey,
    voiceId,
    modelId = 'eleven_multilingual_v2',
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0.3,
    useSpeakerBoost = true,
    onStart,
    onEnd,
    onError,
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Stop any current playback
    stop();

    try {
      setIsLoading(true);
      setError(null);

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();

      // Call ElevenLabs API
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability,
              similarity_boost: similarityBoost,
              style,
              use_speaker_boost: useSpeakerBoost,
            },
            optimize_streaming_latency: 3, // Lower latency
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail?.message || `ElevenLabs API error: ${response.status}`
        );
      }

      // Get audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      currentAudioUrlRef.current = audioUrl;

      setIsLoading(false);
      setIsSpeaking(true);
      onStart?.();

      // Play audio
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.onended = () => {
          setIsSpeaking(false);
          onEnd?.();
          // Cleanup
          if (currentAudioUrlRef.current) {
            URL.revokeObjectURL(currentAudioUrlRef.current);
            currentAudioUrlRef.current = null;
          }
        };
        
        audioRef.current.onerror = (e) => {
          console.error('[useElevenLabsTTS] Audio playback error:', e);
          setIsSpeaking(false);
          setError(new Error('Audio playback failed'));
          onError?.(new Error('Audio playback failed'));
        };

        await audioRef.current.play();
      }

    } catch (err) {
      setIsLoading(false);
      setIsSpeaking(false);
      
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[useElevenLabsTTS] Request aborted');
        return;
      }
      
      const error = err instanceof Error ? err : new Error('TTS failed');
      console.error('[useElevenLabsTTS] Error:', error);
      setError(error);
      onError?.(error);
    }
  }, [apiKey, voiceId, modelId, stability, similarityBoost, style, useSpeakerBoost, onStart, onEnd, onError]);

  const stop = useCallback(() => {
    // Abort any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop audio playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
    }

    // Cleanup blob URL
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }

    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    error,
    audioRef,
  };
}

// Alternative: WebSocket streaming for lower latency
interface ElevenLabsWebSocketOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onError?: (error: Error) => void;
}

export class ElevenLabsWebSocketTTS {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private voiceId: string;
  private modelId: string;
  private onAudioChunk: (chunk: ArrayBuffer) => void;
  private onError?: (error: Error) => void;
  private isConnected = false;

  constructor(options: ElevenLabsWebSocketOptions) {
    this.apiKey = options.apiKey;
    this.voiceId = options.voiceId;
    this.modelId = options.modelId || 'eleven_multilingual_v2';
    this.onAudioChunk = options.onAudioChunk;
    this.onError = options.onError;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=${this.modelId}`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[ElevenLabsWebSocketTTS] Connected');
        this.isConnected = true;
        
        // Send API key
        this.ws?.send(JSON.stringify({
          text: ' ',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
          xi_api_key: this.apiKey,
        }));
        
        resolve();
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          event.data.arrayBuffer().then(buffer => {
            this.onAudioChunk(buffer);
          });
        } else {
          try {
            const message = JSON.parse(event.data);
            if (message.audio) {
              const binary = atob(message.audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              this.onAudioChunk(bytes.buffer);
            }
          } catch (e) {
            console.log('[ElevenLabsWebSocketTTS] Message:', event.data);
          }
        }
      };

      this.ws.onerror = (error) => {
        console.error('[ElevenLabsWebSocketTTS] Error:', error);
        this.onError?.(new Error('WebSocket error'));
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('[ElevenLabsWebSocketTTS] Closed');
        this.isConnected = false;
      };
    });
  }

  sendText(text: string, isFinal: boolean = false): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        text: text + (isFinal ? '' : ' '),
        try_trigger_generation: true,
      }));
      
      if (isFinal) {
        this.ws.send(JSON.stringify({ text: '' }));
      }
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
  }
}
