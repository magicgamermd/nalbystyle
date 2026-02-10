import React, { useState, useRef, useEffect } from 'react';
import { sendMessageToGemini } from '../services/geminiService';
import { ChatMessage, Service, Barber, Language } from '../types';

interface ChatBotProps {
  services: Service[];
  barbers: Barber[];
  lang: Language;
  shopName: string;
  assistantName: string;
}

export const ChatBot: React.FC<ChatBotProps> = ({ services, barbers, lang, shopName, assistantName }) => {
  const [isOpen, setIsOpen] = useState(false);
  // Reset initial message when language changes
  useEffect(() => {
    setMessages([
        { 
            role: 'model', 
            text: lang === 'bg' 
                ? `Добър ден. Аз съм ${assistantName}, Вашият личен консиерж. Как мога да Ви съдействам за Вашата визия днес?` 
                : `Good day. I am ${assistantName}, your personal concierge. How may I assist you with your grooming needs today?`, 
            timestamp: new Date() 
        }
    ]);
  }, [lang, assistantName]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMsg: ChatMessage = {
      role: 'user',
      text: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
        const historyForService = messages.map(m => ({ role: m.role, text: m.text }));
        
        const responseText = await sendMessageToGemini(
            userMsg.text, 
            { services, barbers },
            lang,
            historyForService,
            shopName,
            assistantName
        );

        const botMsg: ChatMessage = {
            role: 'model',
            text: responseText,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, botMsg]);
    } catch (error) {
        console.error("Chat error", error);
    } finally {
        setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-80 md:w-96 h-[500px] bg-dark-800 border border-gold-500/30 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="bg-dark-900 p-4 border-b border-gold-500/30 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gold-500 flex items-center justify-center text-dark-900">
                <i className="fa-solid fa-robot"></i>
              </div>
              <div>
                <h3 className="font-display font-bold text-gold-400">{assistantName}</h3>
                <p className="text-xs text-gray-400">{shopName}</p>
              </div>
            </div>
            <button 
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white transition"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-dark-800">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`max-w-[80%] p-3 rounded-lg text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-gold-600 text-black rounded-tr-none' 
                      : 'bg-dark-700 text-gray-200 border border-gray-700 rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                 <div className="bg-dark-700 p-3 rounded-lg border border-gray-700 rounded-tl-none">
                    <div className="flex gap-1">
                        <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100"></span>
                        <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200"></span>
                    </div>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-dark-900 border-t border-gold-500/20">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={lang === 'bg' ? "Попитайте за прически, стил..." : "Ask about cuts, style, or barbers..."}
                className="flex-1 bg-dark-800 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gold-500 border border-gray-700"
              />
              <button 
                onClick={handleSend}
                disabled={isLoading}
                className="bg-gold-500 hover:bg-gold-400 text-dark-900 px-3 py-2 rounded-md transition disabled:opacity-50"
              >
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-gold-500 hover:bg-gold-400 text-dark-900 rounded-full shadow-lg shadow-gold-500/20 flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
      >
        {isOpen ? <i className="fa-solid fa-chevron-down text-xl"></i> : <i className="fa-solid fa-message text-xl"></i>}
      </button>
    </div>
  );
};
