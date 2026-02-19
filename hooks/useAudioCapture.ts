// hooks/useAudioCapture.ts - Hook for capturing audio from microphone
import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioCaptureOptions } from '../types';

interface UseAudioCaptureReturn {
  audioStream: MediaStream | null;
  isCapturing: boolean;
  error: Error | null;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  audioContext: AudioContext | null;
  analyserNode: AnalyserNode | null;
}

export function useAudioCapture(options: AudioCaptureOptions = {}): UseAudioCaptureReturn {
  const {
    sampleRate = 16000,
    bufferSize = 4096,
    channels = 1,
    echoCancellation = true,
    noiseSuppression = true,
    autoGainControl = true,
  } = options;

  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCapture = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: channels,
          echoCancellation,
          noiseSuppression,
          autoGainControl,
        },
      });

      streamRef.current = stream;
      setAudioStream(stream);

      // Create audio context
      const audioContext = new AudioContext({
        sampleRate,
      });
      audioContextRef.current = audioContext;

      // Create analyser for VAD
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Connect to analyser
      source.connect(analyser);

      // Create script processor for raw audio access
      const processor = audioContext.createScriptProcessor(bufferSize, channels, channels);
      processorRef.current = processor;

      // Connect processor
      analyser.connect(processor);
      processor.connect(audioContext.destination);

      setIsCapturing(true);
      console.log('[useAudioCapture] Audio capture started');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start audio capture');
      setError(error);
      console.error('[useAudioCapture] Error starting capture:', error);
      throw error;
    }
  }, [sampleRate, bufferSize, channels, echoCancellation, noiseSuppression, autoGainControl]);

  const stopCapture = useCallback(async () => {
    try {
      // Stop all tracks in the stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Disconnect and cleanup audio nodes
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
        processorRef.current = null;
      }

      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }

      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }

      setAudioStream(null);
      setIsCapturing(false);
      console.log('[useAudioCapture] Audio capture stopped');
    } catch (err) {
      console.error('[useAudioCapture] Error stopping capture:', err);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  return {
    audioStream,
    isCapturing,
    error,
    startCapture,
    stopCapture,
    audioContext: audioContextRef.current,
    analyserNode: analyserRef.current,
  };
}

// Helper function to convert AudioBuffer to Int16Array (for WebSocket)
export function audioBufferToInt16(buffer: AudioBuffer): Int16Array {
  const channelData = buffer.getChannelData(0);
  const int16Array = new Int16Array(channelData.length);
  
  for (let i = 0; i < channelData.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  
  return int16Array;
}

// Helper function to convert Float32Array to Int16Array
export function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  
  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  
  return int16Array;
}
