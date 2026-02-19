// types.ts - Type definitions for Voice Agent

export type ConversationStep = 'service' | 'datetime' | 'name' | 'phone' | 'confirmation' | 'complete';

export interface BookingData {
  service: string | null;
  dateTime: string | null;
  name: string | null;
  phone: string | null;
  price: number | null;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ConversationState {
  currentStep: ConversationStep;
  bookingData: BookingData;
  history: ConversationMessage[];
  isComplete: boolean;
}

export interface ServiceOption {
  id: string;
  name: string;
  nameBg: string;
  price: number;
  duration: number; // in minutes
  description: string;
  descriptionBg: string;
}

export const SERVICES: ServiceOption[] = [
  {
    id: 'haircut',
    name: 'Haircut',
    nameBg: 'Подстригване',
    price: 40,
    duration: 30,
    description: 'Classic haircut with wash',
    descriptionBg: 'Класическо подстригване с измиване',
  },
  {
    id: 'shave',
    name: 'Classic Shave',
    nameBg: 'Класическо бръснене',
    price: 35,
    duration: 25,
    description: 'Hot towel straight razor shave',
    descriptionBg: 'Бръснене с прав бръснач и гореща кърпа',
  },
  {
    id: 'combo',
    name: 'Combo',
    nameBg: 'Комбо',
    price: 65,
    duration: 50,
    description: 'Haircut + Classic shave',
    descriptionBg: 'Подстригване + Класическо бръснене',
  },
  {
    id: 'beard',
    name: 'Beard Trim',
    nameBg: 'Оформяне на брада',
    price: 25,
    duration: 20,
    description: 'Beard shaping and trimming',
    descriptionBg: 'Оформяне и подстригване на брада',
  },
];

export interface SonioxConfig {
  apiKey: string;
  language: string;
  sampleRate: number;
  enableSpeakerDiarization?: boolean;
  enablePunctuation?: boolean;
}

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export interface VADOptions {
  threshold?: number;
  silenceTimeout?: number;
  minSpeechDuration?: number;
}

export type AgentStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface AudioCaptureOptions {
  sampleRate?: number;
  bufferSize?: number;
  channels?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}
