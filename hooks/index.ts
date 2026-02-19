// hooks/index.ts - Barrel export for all hooks
export { useAudioCapture, audioBufferToInt16, float32ToInt16 } from './useAudioCapture';
export { useSonioxSTT, resampleAudio } from './useSonioxSTT';
export { useElevenLabsTTS, ElevenLabsWebSocketTTS } from './useElevenLabsTTS';
export { useConversation, generateConfirmationSummary } from './useConversation';
