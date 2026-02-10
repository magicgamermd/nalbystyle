import React, { useState, useEffect, useRef } from 'react';
import { AppState, Appointment, Language } from '../types';
import { MultimodalLiveClient, LiveEvent } from '../services/multimodalLiveClient';
import { getFreeSlots, findNextAvailableSlot, loadAppointmentsForDateRange } from '../services/bookingManager';
import { VOICE_CONFIG } from '../constants';
import {
    createAppointment,
    getAppointments,
    getCustomerAppointments,
    rescheduleAppointment,
    cancelAppointment
} from '../services/appointmentService';
import {
    startConversationLog,
    addConversationEvent,
    endConversationLog
} from '../services/conversationLogService';

// Helper to convert ArrayBuffer (Int16 PCM) to Float32Array for Web Audio
function arrayBufferToFloat32(buffer: ArrayBuffer): Float32Array {
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
    }
    return float32;
}

const formatPhoneDigits = (digits: string) => digits.split('').join(' ');

const TOOL_TIMEOUT_MS = 6000;
const MAX_RECONNECTS = 2;
const RECONNECT_DELAY_MS = 1500;

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('timeout')), ms);
    });
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) window.clearTimeout(timeoutId);
    return result as T;
};

interface VoiceAgentProps {
    state: AppState;
    onBook: (appt: Appointment) => void;
    lang: Language;
    shopId: string;
    shopName: string;
    assistantName: string;
}

// Visualizer Configuration
const ORB_CONFIG = {
    particles: 80,
    baseRadius: 100,
    color: '212, 175, 55', // Gold
    glowColor: '255, 215, 0',
    idleSpeed: 0.005,
    speakSpeed: 0.05
};

interface Particle {
    x: number;
    y: number;
    angle: number;
    speed: number;
    radius: number;
    baseRadius: number;
    wobble: number;
    wobbleSpeed: number;
}

export const VoiceAgent: React.FC<VoiceAgentProps> = ({ state, onBook, lang, shopId, shopName, assistantName }) => {
    const [isActive, setIsActive] = useState(false);
    const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [latency, setLatency] = useState<number | null>(null);
    const clientRef = useRef<MultimodalLiveClient | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const playQueue = useRef<Float32Array[]>([]);
    const isPlaying = useRef(false);
    const lastAudioSentTime = useRef<number>(0);
    const waitingForResponse = useRef<boolean>(false);
    const conversationLogId = useRef<string | null>(null);
    const bookingCreated = useRef<boolean>(false);
    const reconnectAttempts = useRef<number>(0);
    const reconnectTimer = useRef<number | null>(null);
    const isUserDisconnecting = useRef<boolean>(false);
    const appointmentsCache = useRef<Map<string, { data: Appointment[]; ts: number }>>(new Map());
    const appointmentsRangeCache = useRef<{ data: Appointment[]; ts: number } | null>(null);
    const APPOINTMENTS_CACHE_TTL_MS = 15000;
    const RANGE_CACHE_TTL_MS = 20000;
    const lastBookingRef = useRef<{ key: string; ts: number } | null>(null);

    // Buffers for transcription - aggregate chunks before logging
    const userTranscriptBuffer = useRef<string>('');
    const agentTranscriptBuffer = useRef<string>('');

    // Get current date and time in Sofia timezone
    const now = new Date();
    const sofiaTime = now.toLocaleString('bg-BG', { timeZone: 'Europe/Sofia', hour: '2-digit', minute: '2-digit' });
    const sofiaDate = now.toLocaleDateString('bg-BG', { timeZone: 'Europe/Sofia', weekday: 'long', day: 'numeric', month: 'long' });

    // Build dynamic barber and service lists from state (Bulgarian only)
    const barberList = state.barbers.map(b => `- ${b.nameBg} (код: ${b.id})`).join('\n');
    const serviceList = state.services.map(s => `- ${s.nameBg} (код: ${s.id})`).join('\n');

    // Dynamic logic for Single Barber Mode
    const singleBarberMode = state.barbers.length === 1;
    const singleBarberName = singleBarberMode ? state.barbers[0].nameBg : '';

    const systemInstruction = `РОЛЯ: Ти си ИНТЕЛИГЕНТЕН РЕЦЕПЦИОНИСТ в "${shopName}".
Тон: МЪЖКАРСКИ, УВЕРЕН, ГОТИН и С АВТОРИТЕТ. 
ИЗПЪЛНЕНИЕ: Говори с нисък, уверен глас. Старай се да звучиш като модерен български мъж.
ВАЖНО - ЕЗИК:
1. МИСЛИ И ГОВОРИ САМО НА БЪЛГАРСКИ.
2. Транскрибирай чутото на кирилица.
3. ПРОИЗНОШЕНИЕ: Казвай думите ясно. Думата "Удобно" се произнася с ударение на първото О (У-добно). "Час" се произнася ясно.

ЦЕНИТЕ СА В ЕВРО (EUR).

Днешна дата: ${sofiaDate}. Час: ${sofiaTime}.

🎯 ТВОЯТА ЦЕЛ: Да помогнеш на клиента с резервация.

📜 ПРАВИЛА ЗА ТЕЛЕФОННИ НОМЕРА (КРИТИЧНО):
1. Когато клиентът диктува телефон, СЛУШАЙ МНОГО ВНИМАТЕЛНО ЗА ВСЯКА ЦИФРА.
2. Ако не си сигурен за някоя цифра, ПОМОЛИ ГО ДА ПОВТОРИ БАВНО.
3. Винаги повтаряй целия номер за потвърждение, преди да запазиш часа. Пример: "Т.е. 0888 123 456, правилно ли е?".
4. Записвай номера само във формат 359... (ако започва с 0, махни го и сложи 359).

📜 ПРАВИЛА ЗА РЕЗЕРВАЦИЯ:
1. Първо разбери УСЛУГАТА.
2. След това питай за ДАТА и ЧАС.
3. Накрая искай ИМЕ и ТЕЛЕФОН.
 4. ФРИЗЬОР: ${singleBarberMode ? `Салонът е ${shopName} (${singleBarberName}).` : `Питай за предпочитания или предложи първия свободен.`}
5. Преди финално записване с tool, кажи: "Добре, записвам Ви за [Дата] в [Час]...".

🧯 ВАЖНО: Ако няма добавени услуги или фризьори, кажи го ясно и помоли да се добавят от администратора, вместо да измисляш.
🧯 ВАЖНО: ГОВОРИ САМО НА БЪЛГАРСКИ. Не използвай английски думи. Ако случайно използваш, коригирай веднага.
📜 ТЕЛЕФОН: След запис, повтори номера цифра по цифра и поискай потвърждение.

💬 ПРИМЕРИ:

Клиент: "Искам час."
Ти: "Здрасти. За подстригване или за брада става въпрос?"
Клиент: "Подстригване."
Ти: "Ок. За кога Ви е удобно?"
Клиент: "Утре в 5."
Ти: "Имам час в 17:00 при ${singleBarberMode ? singleBarberName : 'Марио'}. Записвам ли го?"
Клиент: "Да."
Ти: "Как е името Ви?"
Клиент: "Иван."
Ти: "И телефон за връзка?"
Клиент: "0887 11 22 33."
Ти: "Само да потвърдя: нула, осем, осем, седем, едно, едно, две, две, три, три. Точно така ли е?"
Клиент: "Да."
Ти: (Book Appointment) "Готово, Иване. Чакаме те утре в 17:00."
`;

    const tools = [
        {
            name: "get_barbers",
            description: "Връща списък с всички фризьори и техните специалности.",
            parameters: { type: "object", properties: {} }
        },
        {
            name: "get_services",
            description: "Връща списък с услугите и цените им.",
            parameters: { type: "object", properties: {} }
        },
        {
            name: "get_available_slots",
            description: "Проверява свободните часове за дадена дата и фризьор.",
            parameters: {
                type: "object",
                properties: {
                    date: { type: "string", description: "Дата (примерно: 2026-01-20)" },
                    barberId: { type: "string", description: "Кодът на фризьора" }
                },
                required: ["date", "barberId"]
            }
        },
        {
            name: "find_earliest_slot",
            description: "Намира първия свободен час в следващите 30 дни. Ако не е указан фризьор, проверява всички.",
            parameters: {
                type: "object",
                properties: {
                    barberId: { type: "string", description: "Код на фризьор (по избор)" }
                },
                required: []
            }
        },
        {
            name: "book_appointment",
            description: "Записва час. Телефонът може да е в произволен формат.",
            parameters: {
                type: "object",
                properties: {
                    barberId: { type: "string", description: "Код на фризьор" },
                    serviceId: { type: "string", description: "Код на услуга" },
                    date: { type: "string", description: "Дата (примерно: 2026-01-20)" },
                    time: { type: "string", description: "Час (примерно: 10:00)" },
                    customerName: { type: "string", description: "Име на клиента" },
                    customerPhone: { type: "string", description: "Телефон на клиента" }
                },
                required: ["barberId", "serviceId", "date", "time", "customerName", "customerPhone"]
            }
        },
        {
            name: "get_customer_appointments",
            description: "Търси резервации по телефон или име. Връща списък с резервации.",
            parameters: {
                type: "object",
                properties: {
                    customerPhone: { type: "string", description: "Телефон или име за търсене" }
                },
                required: ["customerPhone"]
            }
        },
        {
            name: "reschedule_appointment",
            description: "Премества съществуваща резервация на нова дата и час.",
            parameters: {
                type: "object",
                properties: {
                    appointmentId: { type: "string", description: "Вътрешен код на резервацията" },
                    newDate: { type: "string", description: "Нова дата" },
                    newTime: { type: "string", description: "Нов час" }
                },
                required: ["appointmentId", "newDate", "newTime"]
            }
        },
        {
            name: "cancel_appointment",
            description: "Отказва съществуваща резервация.",
            parameters: {
                type: "object",
                properties: {
                    appointmentId: { type: "string", description: "Вътрешен код на резервацията" }
                },
                required: ["appointmentId"]
            }
        }
    ];

    const addLog = (msg: string) => {
        setDebugLogs(prev => [...prev.slice(-4), msg]); // Keep last 5 logs
        console.log(msg);
    };

    const getCachedAppointmentsForDate = async (barberId: string, date: string): Promise<Appointment[]> => {
        const key = `${barberId}:${date}`;
        const cached = appointmentsCache.current.get(key);
        if (cached && Date.now() - cached.ts < APPOINTMENTS_CACHE_TTL_MS) {
            return cached.data;
        }
        const data = await withTimeout(
            loadAppointmentsForDateRange(shopId, barberId, date),
            TOOL_TIMEOUT_MS
        );
        appointmentsCache.current.set(key, { data, ts: Date.now() });
        return data;
    };

    const getCachedAppointmentsRange = async (): Promise<Appointment[]> => {
        if (appointmentsRangeCache.current && Date.now() - appointmentsRangeCache.current.ts < RANGE_CACHE_TTL_MS) {
            return appointmentsRangeCache.current.data;
        }
        const today = new Date();
        const thirtyDaysLater = new Date(today);
        thirtyDaysLater.setDate(today.getDate() + 30);
        const data = await withTimeout(
            getAppointments(shopId, undefined, today, thirtyDaysLater),
            TOOL_TIMEOUT_MS
        );
        appointmentsRangeCache.current = { data, ts: Date.now() };
        return data;
    };

    const clearReconnectTimer = () => {
        if (reconnectTimer.current) {
            window.clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
        }
    };

    const scheduleReconnect = (reason: string) => {
        if (!isActive || isUserDisconnecting.current) return;
        if (reconnectAttempts.current >= MAX_RECONNECTS) {
            setError('Връзката е нестабилна. Моля опитайте отново.');
            setStatus('idle');
            setIsActive(false);
            return;
        }
        clearReconnectTimer();
        reconnectAttempts.current += 1;
        setStatus('connecting');
        setError(`Проблем с връзката. Опит за повторно свързване (${reconnectAttempts.current}/${MAX_RECONNECTS})...`);
        addLog(`Reconnect scheduled: ${reason}`);
        reconnectTimer.current = window.setTimeout(async () => {
            try {
                clientRef.current?.disconnect();
                const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
                clientRef.current = new MultimodalLiveClient(apiKey, handleLiveEvent);
                await clientRef.current.connect(systemInstruction, tools);
                setError(null);
            } catch (err) {
                scheduleReconnect('connect_failed');
            }
        }, RECONNECT_DELAY_MS);
    };

    const handleToggle = async () => {
        if (isActive) {
            isUserDisconnecting.current = true;
            clearReconnectTimer();
            // End conversation log before disconnecting
            if (conversationLogId.current) {
                await endConversationLog(
                    shopId,
                    conversationLogId.current,
                    bookingCreated.current ? 'completed' : 'abandoned',
                    bookingCreated.current
                );
                conversationLogId.current = null;
            }
            clientRef.current?.disconnect();
            setIsActive(false);
            setStatus('idle');
            setError(null);
            isUserDisconnecting.current = false;
            return;
        }

        // Initialize AudioContext immediately on user gesture to allow playback
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: VOICE_CONFIG.outputSampleRate
            });
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.connect(audioContextRef.current.destination);
        } else if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }

        setError(null);
        setStatus('connecting');
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        addLog('Connecting...');
        reconnectAttempts.current = 0;

        // Start conversation log
        try {
            conversationLogId.current = await startConversationLog(shopId);
            bookingCreated.current = false;
            addLog(`📝 Лог: ${conversationLogId.current.slice(-8)}`);
        } catch (err) {
            console.error('Failed to start conversation log:', err);
        }

        clientRef.current = new MultimodalLiveClient(apiKey, handleLiveEvent);
        try {
            await clientRef.current.connect(systemInstruction, tools);
        } catch (err) {
            scheduleReconnect('initial_connect_failed');
            return;
        }
        setIsActive(true);
    };

    const handleLiveEvent = (event: LiveEvent) => {
        switch (event.type) {
            case 'open':
                addLog('Session opened, waiting for setup...');
                break;
            case 'setupComplete':
                setStatus('listening');
                addLog('Готово! Слуша...');
                reconnectAttempts.current = 0;
                setError(null);
                // Send a simple trigger to start the conversation
                // The model should greet based on its system instruction
                clientRef.current?.sendText("[Клиент се обажда]");
                break;
            case 'audio':
                // Measure latency on first audio response
                if (waitingForResponse.current && lastAudioSentTime.current > 0) {
                    const responseTime = performance.now() - lastAudioSentTime.current;
                    setLatency(Math.round(responseTime));
                    addLog(`⚡ Latency: ${Math.round(responseTime)}ms`);
                    waitingForResponse.current = false;
                }
                // Convert ArrayBuffer to Float32Array for playback
                const audioData = arrayBufferToFloat32(event.data);
                playQueue.current.push(audioData);
                processPlayQueue();
                break;
            case 'interrupted':
                playQueue.current = [];
                isPlaying.current = false;
                nextPlayTime.current = 0;
                setStatus('listening');
                // Flush any buffered agent response that was interrupted (fire-and-forget)
                if (conversationLogId.current && agentTranscriptBuffer.current.trim()) {
                    const cleanText = agentTranscriptBuffer.current.replace(/<ctrl\d+>/g, '').trim();
                    if (cleanText) {
                        addConversationEvent(shopId, conversationLogId.current, {
                            type: 'agent_response',
                            content: cleanText + ' [прекъснат]'
                        });
                    }
                    agentTranscriptBuffer.current = '';
                }
                // Reset latency tracking for next interaction
                waitingForResponse.current = true;
                lastAudioSentTime.current = performance.now();
                break;
            case 'turnComplete':
                // Model finished responding - flush transcript buffers (fire-and-forget)
                if (conversationLogId.current) {
                    // Log buffered user speech (if any)
                    const cleanUserText = userTranscriptBuffer.current.replace(/<ctrl\d+>/g, '').trim();
                    if (cleanUserText) {
                        addConversationEvent(shopId, conversationLogId.current, {
                            type: 'user_speech',
                            content: cleanUserText
                        }); // No await - fire and forget
                    }
                    // Log buffered agent response (if any)
                    const cleanAgentText = agentTranscriptBuffer.current.replace(/<ctrl\d+>/g, '').trim();
                    if (cleanAgentText) {
                        addConversationEvent(shopId, conversationLogId.current, {
                            type: 'agent_response',
                            content: cleanAgentText
                        }); // No await - fire and forget
                    }
                }
                // Clear buffers
                userTranscriptBuffer.current = '';
                agentTranscriptBuffer.current = '';

                // Ready for next input
                waitingForResponse.current = true;
                lastAudioSentTime.current = performance.now();
                break;
            case 'audioSent':
                // Track when we're sending audio (user speaking)
                if (!isPlaying.current) {
                    lastAudioSentTime.current = performance.now();
                    waitingForResponse.current = true;
                }
                break;
            case 'toolCall':
                handleToolCalls(event.functionCalls);
                break;
            case 'error':
                console.error(event.message);
                addLog(`Error: ${event.message}`);
                if (conversationLogId.current) {
                    addConversationEvent(shopId, conversationLogId.current, {
                        type: 'system',
                        content: `Грешка: ${event.message}`
                    });
                }
                scheduleReconnect('error');
                break;
            case 'close':
                addLog(`Closed: ${event.reason}`);
                scheduleReconnect('close');
                break;
            case 'inputTranscript':
                // User's speech transcription - buffer for logging on turnComplete
                const cleanInput = event.text.replace(/<ctrl[^>]*>/gi, '').trim();
                // Only buffer/log if there's actual text content
                if (cleanInput) {
                    userTranscriptBuffer.current += (userTranscriptBuffer.current ? ' ' : '') + cleanInput;
                    addLog(`👤 ${cleanInput}`);
                }
                break;
            case 'outputTranscript':
                // Agent's speech transcription - buffer for logging on turnComplete
                // Aggressively remove <ctrl...> tags which are showing up in UI
                const cleanOutput = event.text.replace(/<ctrl[^>]*>/gi, '').trim();

                // Only buffer/log if there's actual text content
                if (cleanOutput) {
                    agentTranscriptBuffer.current += (agentTranscriptBuffer.current ? ' ' : '') + cleanOutput;
                    addLog(`🤖 ${cleanOutput.substring(0, 30)}...`);
                }
                break;
        }
    };

    const handleToolCalls = async (calls: any[]) => {
        const toolStartTime = performance.now();
        addLog(`🔧 Tool call: ${calls.map(c => c.name).join(', ')}`);

        const responses = await Promise.all(calls.map(async (call) => {
            let result;
            let error = null;

            try {
                const barbers = state.barbers;
                const services = state.services;
                const hasBarbers = barbers.length > 0;
                const hasServices = services.length > 0;

                switch (call.name) {
                    case 'get_barbers':
                        if (!hasBarbers) {
                            result = { items: [], message: 'Няма добавени фризьори.' };
                            addLog('⚠️ No barbers configured');
                            break;
                        }
                        result = barbers.map(b => ({
                            id: b.id,
                            name: b.nameBg || b.name,
                            specialty: b.specialtyBg || b.specialty
                        }));
                        addLog(`✅ Found ${result.length} barbers`);
                        break;

                    case 'get_services':
                        if (!hasServices) {
                            result = { items: [], message: 'Няма добавени услуги.' };
                            addLog('⚠️ No services configured');
                            break;
                        }
                        result = services.map(s => ({
                            id: s.id,
                            name: s.nameBg || s.name,
                            price: s.price,
                            duration: s.duration
                        }));
                        addLog(`✅ Found ${result.length} services`);
                        break;

                    case 'get_available_slots':
                        if (!hasBarbers) {
                            result = { error: 'Няма налични фризьори.' };
                            break;
                        }
                        if (!barbers.find(b => b.id === call.args.barberId)) {
                            result = { error: 'Няма такъв фризьор.' };
                            break;
                        }
                        // Load appointments from Firestore for the specific date
                        const appointments = await getCachedAppointmentsForDate(call.args.barberId, call.args.date);
                        let slots = getFreeSlots(call.args.date, call.args.barberId, appointments);

                        // Filter out past times AND enforce 45-minute lead time
                        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });
                        if (call.args.date === todayStr) {
                            const now = new Date();
                            const bufferMinutes = 45;

                            slots = slots.filter(slot => {
                                const [hours, minutes] = slot.split(':').map(Number);
                                const slotDate = new Date(now);
                                slotDate.setHours(hours, minutes, 0, 0);

                                const timeDiffMs = slotDate.getTime() - now.getTime();
                                const timeDiffMinutes = timeDiffMs / (1000 * 60);

                                return timeDiffMinutes > bufferMinutes;
                            });
                        }
                        result = slots;
                        addLog(`✅ Found ${result.length} free slots`);
                        break;

                    case 'find_earliest_slot':
                        if (!hasBarbers) {
                            result = { message: 'Няма налични фризьори.' };
                            break;
                        }
                        if (call.args.barberId && !barbers.find(b => b.id === call.args.barberId)) {
                            result = { message: 'Няма такъв фризьор.' };
                            break;
                        }
                        const allCheckAppointments = await getCachedAppointmentsRange();

                        const foundSlot = findNextAvailableSlot(
                            allCheckAppointments,
                            barbers,
                            call.args.barberId
                        );

                        if (foundSlot) {
                            const barberName = barbers.find(b => b.id === foundSlot.barberId)?.nameBg;
                            result = {
                                ...foundSlot,
                                message: `Най-ранният час е на ${foundSlot.date} в ${foundSlot.time} при ${barberName}.`
                            };
                            addLog(`✅ Earliest: ${foundSlot.date} ${foundSlot.time} (${barberName})`);
                        } else {
                            result = { message: "Няма свободни часове за скоро." };
                            addLog(`❌ No slots found`);
                        }
                        break;

                    case 'book_appointment':
                        if (!hasBarbers || !hasServices) {
                            result = { success: false, error: 'Няма налични услуги или фризьори.' };
                            break;
                        }
                        const finalBarberId = call.args.barberId;
                        if (!finalBarberId || !barbers.find(b => b.id === finalBarberId)) {
                            result = { success: false, error: 'Невалиден фризьор.' };
                            break;
                        }
                        if (!services.find(s => s.id === call.args.serviceId)) {
                            result = { success: false, error: 'Невалидна услуга.' };
                            break;
                        }

                        // First check if slot is still available (prevent double booking)
                        const checkAppts = await getCachedAppointmentsForDate(finalBarberId, call.args.date);
                        const slotStillFree = getFreeSlots(call.args.date, finalBarberId, checkAppts)
                            .includes(call.args.time);

                        if (!slotStillFree) {
                            result = {
                                success: false,
                                error: 'Часът вече е зает. Моля изберете друг.'
                            };
                            addLog(`❌ Slot taken: ${call.args.time}`);
                            break;
                        }

                        // Normalize phone number: remove non-digits, replace leading 0 with 359
                        let phone = call.args.customerPhone.replace(/\D/g, '');
                        if (phone.startsWith('0')) phone = '359' + phone.substring(1);
                        if (!phone.startsWith('359')) phone = '359' + phone;

                        const bookingKey = `${finalBarberId}|${call.args.serviceId}|${call.args.date}|${call.args.time}|${phone}`;
                        if (lastBookingRef.current && lastBookingRef.current.key === bookingKey) {
                            if (Date.now() - lastBookingRef.current.ts < 10000) {
                                result = {
                                    success: true,
                                    appointmentId: 'duplicate',
                                    message: `Часът вече е записан. Потвърждавам телефон: ${formatPhoneDigits(phone)}.`
                                };
                                addLog('⚠️ Duplicate booking prevented');
                                break;
                            }
                        }

                        // Create appointment in Firestore
                        const dateTime = new Date(`${call.args.date}T${call.args.time}`);
                        const newAppt = await withTimeout(
                            createAppointment(shopId, {
                                serviceId: call.args.serviceId,
                                barberId: finalBarberId,
                                date: dateTime.toISOString(),
                                customerName: call.args.customerName,
                                customerEmail: `+${phone}`,
                                status: 'pending'
                            }),
                            TOOL_TIMEOUT_MS
                        );

                        // Also update local state for immediate UI update
                        onBook(newAppt);

                        result = {
                            success: true,
                            appointmentId: newAppt.id,
                            message: `Готово! Часът е записан за ${call.args.date} в ${call.args.time}. Потвърждавам телефон: ${formatPhoneDigits(phone)}.`
                        };
                        lastBookingRef.current = { key: bookingKey, ts: Date.now() };
                        addLog(`✅ Booked: ${newAppt.id.slice(-6)}`);
                        break;

                    case 'get_customer_appointments':
                        // Service now handles phone normalization AND name matching
                        const searchTerm = call.args.customerPhone;
                        addLog(`🔍 Searching for: ${searchTerm}`);

                        // Get customer's appointments from Firestore (by phone OR name)
                        const customerAppts = await withTimeout(getCustomerAppointments(shopId, searchTerm), TOOL_TIMEOUT_MS);

                        if (customerAppts.length === 0) {
                            result = { message: "Не намерих записани часове с това търсене." };
                        } else {
                            result = customerAppts.map(apt => ({
                                id: apt.id,
                                customerName: apt.customerName,
                                date: new Date(apt.date).toLocaleDateString('bg-BG'),
                                time: new Date(apt.date).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }),
                                barberName: state.barbers.find(b => b.id === apt.barberId)?.nameBg || apt.barberId,
                                serviceName: state.services.find(s => s.id === apt.serviceId)?.nameBg || apt.serviceId,
                                status: apt.status
                            }));
                        }
                        addLog(`✅ Found ${customerAppts.length} appointments`);
                        break;

                    case 'reschedule_appointment':
                        // Validate inputs
                        if (!call.args.appointmentId || !call.args.newDate || !call.args.newTime) {
                            result = { error: "Липсват данни за преместване (ID, дата или час)." };
                            break;
                        }

                        // Reschedule in Firestore
                        await withTimeout(
                            rescheduleAppointment(
                                shopId,
                                call.args.appointmentId,
                                call.args.newDate,
                                call.args.newTime
                            ),
                            TOOL_TIMEOUT_MS
                        );
                        result = {
                            success: true,
                            message: `Готово! Часът е преместен на ${call.args.newDate} в ${call.args.newTime}.`
                        };
                        addLog(`✅ Rescheduled: ${call.args.appointmentId.slice(-6)} to ${call.args.newDate} ${call.args.newTime}`);
                        break;

                    case 'cancel_appointment':
                        // Cancel in Firestore
                        await withTimeout(cancelAppointment(shopId, call.args.appointmentId), TOOL_TIMEOUT_MS);
                        result = {
                            success: true,
                            message: `Часът е отказан успешно.`
                        };
                        addLog(`✅ Cancelled: ${call.args.appointmentId.slice(-6)}`);
                        break;

                    default:
                        result = { error: `Unknown tool: ${call.name}` };
                }
            } catch (err: any) {
                console.error(`Tool ${call.name} error:`, err);
                const isTimeout = err?.message === 'timeout';
                error = isTimeout ? 'Връзката е бавна. Моля опитайте пак.' : (err.message || 'Възникна грешка');
                result = { error };
                addLog(`❌ Error: ${error}`);
            }

            return {
                id: call.id,
                name: call.name,
                response: { result }
            };
        }));

        const toolTime = Math.round(performance.now() - toolStartTime);
        addLog(`🔧 Tool processed in ${toolTime}ms`);

        // Log tool calls to conversation log (only once!)
        if (conversationLogId.current) {
            for (const call of calls) {
                const response = responses.find(r => r.id === call.id);
                addConversationEvent(shopId, conversationLogId.current, {
                    type: 'tool_call',
                    content: call.name,
                    metadata: {
                        args: call.args,
                        result: response?.response?.result
                    }
                });

                // Track if a meaningful action was completed (booking, reschedule, cancel)
                const isSuccess = response?.response?.result?.success;
                if (isSuccess && (
                    call.name === 'book_appointment' ||
                    call.name === 'reschedule_appointment' ||
                    call.name === 'cancel_appointment'
                )) {
                    bookingCreated.current = true;
                }
            }
        }

        // Reset latency tracking - measure from tool response to first audio
        lastAudioSentTime.current = performance.now();
        waitingForResponse.current = true;

        clientRef.current?.sendToolResponse(responses);
    };

    // Track scheduled audio end time for seamless playback
    const nextPlayTime = useRef<number>(0);

    const processPlayQueue = async () => {
        if (!audioContextRef.current || playQueue.current.length === 0) return;

        // Don't start new processing if already playing, let the scheduled audio continue
        if (isPlaying.current && playQueue.current.length < 3) return;

        isPlaying.current = true;
        setStatus('speaking');

        const ctx = audioContextRef.current;

        // Initialize nextPlayTime if needed
        if (nextPlayTime.current < ctx.currentTime) {
            nextPlayTime.current = ctx.currentTime;
        }

        // Schedule all queued audio chunks
        while (playQueue.current.length > 0) {
            const data = playQueue.current.shift()!;
            const buffer = ctx.createBuffer(1, data.length, VOICE_CONFIG.outputSampleRate);
            buffer.getChannelData(0).set(data);

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(analyserRef.current!);

            // Schedule to play at the next available time
            source.start(nextPlayTime.current);

            // Update next play time
            nextPlayTime.current += buffer.duration;

            // Mark as finished when last scheduled chunk ends
            source.onended = () => {
                if (playQueue.current.length === 0 && ctx.currentTime >= nextPlayTime.current - 0.1) {
                    isPlaying.current = false;
                    setStatus('listening');
                }
            };
        }
    };

    // New Visualizer Logic for "Golden Orb"
    useEffect(() => {
        if (!isActive || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;

        // Resize canvas to full screen
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);
        resize();

        // Initialize Particles
        const particles: Particle[] = [];
        for (let i = 0; i < ORB_CONFIG.particles; i++) {
            particles.push({
                x: 0,
                y: 0,
                angle: (Math.PI * 2 * i) / ORB_CONFIG.particles,
                speed: ORB_CONFIG.idleSpeed + Math.random() * 0.005,
                radius: 2 + Math.random() * 3,
                baseRadius: ORB_CONFIG.baseRadius + Math.random() * 20,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.02 + Math.random() * 0.03
            });
        }

        let animationId: number;
        let time = 0;

        const render = () => {
            if (!analyserRef.current) return;

            // Get Audio Data
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);

            // Calculate Volume / Energy
            const average = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
            const energy = average / 255; // 0 to 1

            // Determine State-based multipliers
            let radiusMultiplier = 1;
            let speedMultiplier = 1;
            let glowIntensity = 0.5;

            if (status === 'speaking') { // Agent speaking
                radiusMultiplier = 1 + (energy * 1.5); // Big pulsation
                speedMultiplier = 3;
                glowIntensity = 0.8 + (energy * 0.2);
            } else if (status === 'listening' && waitingForResponse.current) { // User speaking (or waiting)
                // If waiting for response (thinking), spin fast
                if (!isPlaying.current && waitingForResponse.current && lastAudioSentTime.current > 0) {
                    radiusMultiplier = 0.8;
                    speedMultiplier = 8; // Fast spin "Thinking"
                    glowIntensity = 1;
                } else {
                    // Just listening to mic noise (could add mic input viz here if we had access to mic stream analyser easily)
                    radiusMultiplier = 1;
                    speedMultiplier = 1;
                }
            }

            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Traildown effect
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            // Draw Core Glow
            const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, ORB_CONFIG.baseRadius * 2);
            gradient.addColorStop(0, `rgba(${ORB_CONFIG.glowColor}, ${glowIntensity})`);
            gradient.addColorStop(1, `rgba(${ORB_CONFIG.color}, 0)`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Update and Draw Particles
            ctx.fillStyle = `rgb(${ORB_CONFIG.color})`;
            ctx.beginPath();

            particles.forEach((p, i) => {
                p.angle += p.speed * speedMultiplier;
                p.wobble += p.wobbleSpeed;

                // Audio reactive radius
                const audioMod = (dataArray[i % dataArray.length] / 255) * 50 * (status === 'speaking' ? 1 : 0);

                const currentRadius = (p.baseRadius * radiusMultiplier) + Math.sin(p.wobble) * 10 + audioMod;

                p.x = cx + Math.cos(p.angle) * currentRadius;
                p.y = cy + Math.sin(p.angle) * currentRadius;

                ctx.moveTo(p.x, p.y);
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            });
            ctx.fill();

            // Draw Connecting Lines (Neural Network look)
            ctx.strokeStyle = `rgba(${ORB_CONFIG.color}, 0.2)`;
            ctx.beginPath();
            particles.forEach((p, i) => {
                if (i % 3 === 0) { // Connect every 3rd particle to center
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(cx, cy);
                }
            });
            ctx.stroke();

            time += 0.01;
            animationId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, [isActive, status]);


    return (
        <>
            {/* Activation Button (Widgets) - Always visible when inactive */}
            {!isActive && (
                <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-3 animated-fade-in">
                    <button
                        onClick={handleToggle}
                        className="w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.4)] transition-all duration-300 border-2 bg-gold-500 border-gold-400 hover:scale-110 active:scale-95 text-black hover:bg-white"
                    >
                        <i className="fa-solid fa-microphone text-2xl"></i>
                    </button>
                    <div className="bg-black/90 px-4 py-2 rounded-full border border-gold-500/30 text-gold-500 text-xs font-bold animate-bounce shadow-lg">
                        {assistantName}
                    </div>
                </div>
            )}

            {/* Immersive Overlay - Visible when active */}
            {isActive && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center animate-in fade-in duration-300">
                    {/* Dark Backdrop */}
                    <div className="absolute inset-0 bg-dark-900/95 backdrop-blur-md" onClick={handleToggle}></div>

                    {/* Canvas Visualizer */}
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 z-0 pointer-events-none"
                    />

                    {/* Foreground Content */}
                    <div className="relative z-10 flex flex-col items-center justify-between h-full py-20 pointer-events-none">

                        {/* Status Header */}
                        <div className="text-center space-y-2 opacity-80">
                            <div className="text-gold-500 tracking-[0.3em] text-xs uppercase font-bold">
                                 {assistantName}
                            </div>
                            <div className="text-2xl font-display text-white">
                                {status === 'connecting' && 'Свързване...'}
                                {status === 'listening' && 'Слушам Ви...'}
                                {status === 'speaking' && `${assistantName} говори`}
                                {status === 'idle' && 'В готовност'}
                            </div>
                        </div>

                        {/* Middle Spacer for Orb */}
                        <div className="flex-1"></div>

                        {/* Controls & Debug */}
                        <div className="flex flex-col items-center gap-6 pointer-events-auto">
                            {/* Latency value hidden for user */}

                            {/* Close Button */}
                            <button
                                onClick={handleToggle}
                                className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all duration-300 backdrop-blur-sm group"
                            >
                                <i className="fa-solid fa-xmark text-2xl group-hover:rotate-90 transition-transform"></i>
                            </button>

                            <div className="text-white/20 text-xs">
                                Натисни за да затвориш
                            </div>
                        </div>
                    </div>

                    {/* Live Transcript Log (Hidden) */}
                    {/* <div className="absolute bottom-40 left-0 right-0 px-8 text-center pointer-events-none"> ... </div> */}

                </div>
            )}
        </>
    );
};
