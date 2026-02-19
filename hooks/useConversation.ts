// hooks/useConversation.ts - Hook for managing conversation flow and booking state
import { useState, useCallback, useMemo } from 'react';
import { 
  ConversationStep, 
  BookingData, 
  ConversationMessage, 
  SERVICES,
  ServiceOption 
} from '../types';

interface UseConversationReturn {
  bookingData: BookingData;
  currentStep: ConversationStep;
  conversationHistory: ConversationMessage[];
  updateBookingData: (updates: Partial<BookingData>) => void;
  getNextQuestion: () => string;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  resetConversation: () => void;
  isComplete: boolean;
  getMissingFields: () => string[];
  detectService: (input: string) => ServiceOption | null;
  detectDateTime: (input: string) => string | null;
  detectPhone: (input: string) => string | null;
}

const INITIAL_BOOKING_DATA: BookingData = {
  service: null,
  dateTime: null,
  name: null,
  phone: null,
  price: null,
};

const GREETINGS = [
  'Здравейте! Аз съм вашият виртуален асистент за Blade & Bourbon. С какво мога да ви помогна днес?',
  'Добре дошли в Blade & Bourbon! Готов съм да ви запиша за посещение. Каква услуга търсите?',
  'Здравейте! Тук съм, за да ви помогна с резервация. Кажете ми какво ви трябва?',
];

export function useConversation(): UseConversationReturn {
  const [bookingData, setBookingData] = useState<BookingData>(INITIAL_BOOKING_DATA);
  const [currentStep, setCurrentStep] = useState<ConversationStep>('service');
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);

  const updateBookingData = useCallback((updates: Partial<BookingData>) => {
    setBookingData(prev => {
      const newData = { ...prev, ...updates };
      
      // Auto-advance step based on data completeness
      if (!newData.service) {
        setCurrentStep('service');
      } else if (!newData.dateTime) {
        setCurrentStep('datetime');
      } else if (!newData.name) {
        setCurrentStep('name');
      } else if (!newData.phone) {
        setCurrentStep('phone');
      } else {
        setCurrentStep('confirmation');
      }
      
      return newData;
    });
  }, []);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setConversationHistory(prev => [
      ...prev,
      {
        role,
        content,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const getNextQuestion = useCallback((): string => {
    switch (currentStep) {
      case 'service':
        const servicesList = SERVICES.map(s => `${s.nameBg} - ${s.price} лв`).join(', ');
        return `Каква услуга желаете? Имаме: ${servicesList}. Кажете "комбо" за подстригване и бръснене заедно.`;

      case 'datetime':
        return 'Перфектно! За кога желаете да запазим час? Можете да кажете дата и час, например "утре в 15:00" или "20 февруари в 10:30".';

      case 'name':
        return 'Отлично! С какво име да запазя резервацията?';

      case 'phone':
        return 'Благодаря! И телефонен номер за връзка, моля?';

      case 'confirmation':
        const { service, dateTime, name, phone, price } = bookingData;
        return `Да потвърдим: ${service} на ${dateTime} за ${name}, телефон ${phone}. Цена: ${price} лв. Вярно ли е?`;

      case 'complete':
        return 'Чудесно! Вашата резервация е потвърдена. Очакваме ви в Blade & Bourbon! Ако имате въпроси, не се колебайте да ни потърсите.';

      default:
        return 'Как мога да ви помогна?';
    }
  }, [currentStep, bookingData]);

  const resetConversation = useCallback(() => {
    setBookingData(INITIAL_BOOKING_DATA);
    setCurrentStep('service');
    setConversationHistory([]);
  }, []);

  const isComplete = useMemo(() => {
    return (
      bookingData.service !== null &&
      bookingData.dateTime !== null &&
      bookingData.name !== null &&
      bookingData.phone !== null &&
      currentStep === 'confirmation'
    );
  }, [bookingData, currentStep]);

  const getMissingFields = useCallback((): string[] => {
    const missing: string[] = [];
    if (!bookingData.service) missing.push('услуга');
    if (!bookingData.dateTime) missing.push('дата и час');
    if (!bookingData.name) missing.push('име');
    if (!bookingData.phone) missing.push('телефон');
    return missing;
  }, [bookingData]);

  // Detection helpers
  const detectService = useCallback((input: string): ServiceOption | null => {
    const lowerInput = input.toLowerCase();
    
    for (const service of SERVICES) {
      const keywords = [
        service.nameBg.toLowerCase(),
        service.name.toLowerCase(),
        ...service.nameBg.toLowerCase().split(' '),
      ];
      
      if (keywords.some(kw => lowerInput.includes(kw))) {
        return service;
      }
    }
    
    // Special cases
    if (lowerInput.includes('комбо') || lowerInput.includes('двете') || lowerInput.includes('и двете')) {
      return SERVICES.find(s => s.id === 'combo') || null;
    }
    
    if (lowerInput.includes('брада') && !lowerInput.includes('бръснене')) {
      return SERVICES.find(s => s.id === 'beard') || null;
    }
    
    return null;
  }, []);

  const detectDateTime = useCallback((input: string): string | null => {
    const lowerInput = input.toLowerCase();
    
    // Relative dates
    if (lowerInput.includes('днес')) {
      return 'днес';
    }
    if (lowerInput.includes('утре')) {
      return 'утре';
    }
    if (lowerInput.includes('вдругиден') || lowerInput.includes('в други ден')) {
      return 'вдругиден';
    }
    
    // Date patterns
    const datePatterns = [
      /(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/, // 20.02 or 20/02/2025
      /(\d{1,2})\s+(януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)/i,
    ];
    
    for (const pattern of datePatterns) {
      const match = input.match(pattern);
      if (match) {
        return match[0];
      }
    }
    
    // Time patterns
    const timePattern = /(\d{1,2})[:\s](\d{2})\s*(?:часа?)?/;
    if (timePattern.test(input)) {
      return input.match(timePattern)?.[0] || null;
    }
    
    return null;
  }, []);

  const detectPhone = useCallback((input: string): string | null => {
    // Bulgarian phone patterns
    const patterns = [
      /(\+359)\s*(\d{3})\s*(\d{3})\s*(\d{3})/, // +359 888 123 456
      /(0\d{2})\s*(\d{3})\s*(\d{4})/, // 0888 123 456
      /(0\d{2})(\d{7})/, // 0888123456
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[0].replace(/\s/g, '');
      }
    }
    
    return null;
  }, []);

  return {
    bookingData,
    currentStep,
    conversationHistory,
    updateBookingData,
    getNextQuestion,
    addMessage,
    resetConversation,
    isComplete,
    getMissingFields,
    detectService,
    detectDateTime,
    detectPhone,
  };
}

// Utility to generate confirmation summary
export function generateConfirmationSummary(bookingData: BookingData): string {
  if (!bookingData.service || !bookingData.dateTime || !bookingData.name || !bookingData.phone) {
    return '';
  }

  return `
📋 РЕЗЕРВАЦИЯ

💈 Услуга: ${bookingData.service}
📅 Дата/Час: ${bookingData.dateTime}
👤 Име: ${bookingData.name}
📞 Телефон: ${bookingData.phone}
💰 Цена: ${bookingData.price} лв

Благодарим ви, че избрахте Blade & Bourbon! 🥃✂️
  `.trim();
}
