import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { VOICE_MODEL, VOICE_CONFIG } from '../constants';

export type LiveEvent =
    | { type: 'open' }
    | { type: 'setupComplete' }
    | { type: 'close'; reason: string }
    | { type: 'error'; message: string }
    | { type: 'audio'; data: ArrayBuffer }
    | { type: 'interrupted' }
    | { type: 'toolCall'; functionCalls: any[] }
    | { type: 'text'; text: string }
    | { type: 'audioSent' }  // Track when we send audio
    | { type: 'turnComplete' }  // Track when model finishes responding
    | { type: 'inputTranscript'; text: string }  // User's speech transcription
    | { type: 'outputTranscript'; text: string };  // Agent's speech transcription

export class MultimodalLiveClient {
    private client: GoogleGenAI;
    private session: any = null;
    private audioContext: AudioContext | null = null;
    private processor: ScriptProcessorNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private stream: MediaStream | null = null;
    private onEvent: (event: LiveEvent) => void;
    private lastAudioSentEventTime: number = 0;

    constructor(apiKey: string, onEvent: (event: LiveEvent) => void) {
        this.client = new GoogleGenAI({ apiKey });
        this.onEvent = onEvent;
    }

    public async connect(systemInstruction: string, tools: any[] = []) {
        console.log('[MultimodalLive] Connecting with new SDK...');

        try {
            // Build config for Live API - set fields directly (not in generationConfig)
            const config: any = {
                responseModalities: [Modality.AUDIO],
                systemInstruction: systemInstruction,
                // Speed optimizations - set directly on config
                temperature: 0.5,  // Lower for faster, more deterministic responses
                maxOutputTokens: 1024,
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: "Puck"
                        }
                    }
                },
                // Enable transcription for logging conversations
                inputAudioTranscription: {},  // Transcribe user's audio input
                outputAudioTranscription: {}  // Transcribe model's audio output
            };

            // Add tools if provided
            if (tools && tools.length > 0) {
                config.tools = [{
                    functionDeclarations: tools
                }];
            }

            console.log('[MultimodalLive] Config:', JSON.stringify(config, null, 2));

            // Connect using the new SDK's live.connect method
            this.session = await this.client.live.connect({
                model: VOICE_MODEL,
                config: config,
                callbacks: {
                    onopen: () => {
                        console.log('[MultimodalLive] Session opened');
                        this.onEvent({ type: 'open' });
                    },
                    onmessage: (message: LiveServerMessage) => {
                        this.handleMessage(message);
                    },
                    onerror: (error: ErrorEvent) => {
                        console.error('[MultimodalLive] Error:', error);
                        this.onEvent({ type: 'error', message: error.message || 'Connection error' });
                    },
                    onclose: (event: CloseEvent) => {
                        console.log('[MultimodalLive] Session closed:', event.code, event.reason);
                        this.onEvent({ type: 'close', reason: event.reason || `Code: ${event.code}` });
                    }
                }
            });

            console.log('[MultimodalLive] Session created successfully');

            // Initialize audio input
            await this.initAudio();

        } catch (err: any) {
            console.error('[MultimodalLive] Connection failed:', err);
            this.onEvent({ type: 'error', message: err.message || 'Failed to connect' });
        }
    }

    private handleMessage(message: LiveServerMessage) {
        // Only log non-audio messages to reduce console spam
        if (!message.serverContent || !(message.serverContent as any).modelTurn?.parts?.[0]?.inlineData) {
            console.log('[MultimodalLive] Received:', Object.keys(message));
        }

        // Handle setup completion
        if (message.setupComplete) {
            console.log('[MultimodalLive] Setup complete!');
            this.onEvent({ type: 'setupComplete' });
            return;
        }

        // Handle server content (audio, text, tool calls, transcripts)
        if (message.serverContent) {
            const serverContent = message.serverContent as any;
            const { modelTurn, interrupted, turnComplete, inputTranscription, outputTranscription } = serverContent;

            // Handle user's speech transcription
            if (inputTranscription?.text) {
                console.log('[MultimodalLive] 👤 User:', inputTranscription.text);
                this.onEvent({ type: 'inputTranscript', text: inputTranscription.text });
            }

            // Handle model's speech transcription
            if (outputTranscription?.text) {
                console.log('[MultimodalLive] 🤖 Agent:', outputTranscription.text);
                this.onEvent({ type: 'outputTranscript', text: outputTranscription.text });
            }

            if (interrupted) {
                console.log('[MultimodalLive] Interrupted');
                this.onEvent({ type: 'interrupted' });
            }

            if (modelTurn?.parts) {
                for (const part of modelTurn.parts) {
                    if (part.inlineData?.data) {
                        // Audio data
                        const audioData = this.base64ToArrayBuffer(part.inlineData.data);
                        this.onEvent({ type: 'audio', data: audioData });
                    }
                    if (part.text) {
                        // Filter out control characters (like <ctrl46>)
                        const cleanText = part.text.replace(/<ctrl[^>]*>/gi, '').trim();
                        if (!cleanText) return;

                        // Filter out model's internal "thinking" (starts with ** or contains reasoning)
                        const isThinking = cleanText.startsWith('**') ||
                            cleanText.includes('I\'m') ||
                            cleanText.includes('My ') ||
                            cleanText.includes('I need');
                        if (!isThinking) {
                            console.log('[MultimodalLive] Text:', cleanText);
                            this.onEvent({ type: 'text', text: cleanText });
                        }
                    }
                }
            }

            // Track when model finishes a turn
            if (turnComplete) {
                this.onEvent({ type: 'turnComplete' });
            }
        }

        // Handle tool calls
        if (message.toolCall) {
            console.log('[MultimodalLive] Tool call:', message.toolCall);
            this.onEvent({ type: 'toolCall', functionCalls: message.toolCall.functionCalls || [] });
        }
    }

    public sendText(text: string) {
        if (!this.session) {
            console.warn('[MultimodalLive] No active session');
            return;
        }
        console.log('[MultimodalLive] Sending text:', text);
        this.session.sendClientContent({
            turns: [{
                role: "user",
                parts: [{ text }]
            }],
            turnComplete: true
        });
    }

    public sendToolResponse(functionResponses: any[]) {
        if (!this.session) {
            console.warn('[MultimodalLive] No active session');
            return;
        }
        console.log('[MultimodalLive] Sending tool response:', functionResponses);

        // Send the tool response
        this.session.sendToolResponse({ functionResponses });
    }

    private async initAudio() {
        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: VOICE_CONFIG.inputSampleRate
            });

            // Request 16kHz to minimize resampling needs
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    autoGainControl: true,
                    noiseSuppression: true
                }
            });

            // Modern AudioWorklet implementation
            try {
                // Load the worklet module from public folder
                await this.audioContext.audioWorklet.addModule('/audio-processor.js');

                this.source = this.audioContext.createMediaStreamSource(this.stream);
                const workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

                workletNode.port.onmessage = (event) => {
                    if (event.data.event === 'audio') {
                        this.sendAudio(event.data.data);
                    }
                };

                this.source.connect(workletNode);
                workletNode.connect(this.audioContext.destination);

                console.log(`[MultimodalLive] AudioWorklet initialized: ${this.audioContext.sampleRate}Hz`);
            } catch (workletError) {
                console.warn('[MultimodalLive] AudioWorklet failed, falling back to ScriptProcessor:', workletError);
                // Fallback for older browsers or if worklet fails to load
                this.initAudioFallback();
            }

        } catch (err) {
            console.error('[MultimodalLive] Audio initialization failed:', err);
            this.onEvent({ type: 'error', message: 'Mic access denied or audio error' });
        }
    }

    private initAudioFallback() {
        if (!this.audioContext || !this.stream) return;

        this.source = this.audioContext.createMediaStreamSource(this.stream);
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);

        this.processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            this.sendAudio(inputData);
        };
        console.log('[MultimodalLive] Fallback ScriptProcessor initialized');
    }

    private sendAudio(data: Float32Array) {
        if (!this.session) return;

        // Simple downsampling if context is higher than target 16kHz
        let processData = data;
        const targetRate = 16000;
        const currentRate = this.audioContext?.sampleRate || 16000;

        if (currentRate > targetRate) {
            const ratio = Math.floor(currentRate / targetRate);
            const downsampled = new Float32Array(Math.floor(data.length / ratio));
            for (let i = 0; i < downsampled.length; i++) {
                downsampled[i] = data[i * ratio];
            }
            processData = downsampled;
        }

        // Convert Float32 to Int16 PCM
        const pcm16 = new Int16Array(processData.length);
        for (let i = 0; i < processData.length; i++) {
            const s = Math.max(-1, Math.min(1, processData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert to base64
        const base64 = this.arrayBufferToBase64(pcm16.buffer);

        // Send realtime audio input
        this.session.sendRealtimeInput({
            audio: {
                data: base64,
                mimeType: "audio/pcm;rate=16000"
            }
        });

        // Throttle audioSent events to every 500ms (avoid flooding)
        const now = performance.now();
        if (now - this.lastAudioSentEventTime > 500) {
            this.lastAudioSentEventTime = now;
            this.onEvent({ type: 'audioSent' });
        }
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    public disconnect() {
        console.log('[MultimodalLive] Disconnecting...');
        this.session?.close();
        this.session = null;
        this.stream?.getTracks().forEach(t => t.stop());
        this.processor?.disconnect();
        this.source?.disconnect();
        this.audioContext?.close();
    }
}
