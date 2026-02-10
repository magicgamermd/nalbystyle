
export type Language = 'en' | 'bg';

export interface Service {
  id: string;
  name: string;
  nameBg: string;
  price: number | string; // Changed to allow string for "Specialist" or ranges
  duration: number; // in minutes
  description: string;
  descriptionBg: string;
  icon: string; // FontAwesome class
  imageUrl?: string; // New: For AI generated images
}

export interface Barber {
  id: string;
  name: string;
  nameBg: string;
  specialty: string;
  specialtyBg: string;
  bio: string;
  bioBg: string;
  avatar: string;
  rating: number;
  username?: string; // New: For staff login
  password?: string; // New: For staff login
}

export interface Appointment {
  id: string;
  customerName: string;
  customerEmail: string;
  serviceId: string;
  barberId: string;
  date: string; // ISO String
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface AppState {
  services: Service[];
  barbers: Barber[];
  appointments: Appointment[];
}

export interface ShopBranding {
  name: string;
  tagline?: string;
  logoUrl?: string;
}

export interface ShopHeroImages {
  desktopUrl?: string;
  mobileUrl?: string;
}

export interface ShopContact {
  address: string;
  phone: string;
  email: string;
}

export interface ShopHours {
  monFri: string;
  sat: string;
  sun: string;
}

export interface ShopFeatures {
  voiceEnabled: boolean;
  chatEnabled: boolean;
  aiToolsEnabled: boolean;
}

export interface ShopConfig {
  id: string;
  domains: string[];
  adminUids: string[];
  plan: 'basic' | 'pro' | 'premium';
  branding: ShopBranding;
  hero: ShopHeroImages;
  contact: ShopContact;
  hours: ShopHours;
  themeId: string;
  voiceAgentName: string;
  features: ShopFeatures;
  onboarded: boolean;
  createdAt: number;
  updatedAt?: number;
}
