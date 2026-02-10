цлауде
import { WebSocket } from 'ws';

const apiKey = "AIzaSyAyLZxJeDAeStVZ7Ta41COgz6wEL6dio9k"; // Sourced from .env.local
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

const ws = new WebSocket(url);

ws.on('open', () => {
    console.log('Connected to Gemini WebSocket');

    const setupMessage = {
        setup: {
            model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
            generationConfig: {
                responseModalities: ["AUDIO"]
            }
        }
    };

    console.log('Sending setup:', JSON.stringify(setupMessage, null, 2));
    ws.send(JSON.stringify(setupMessage));

    // Send a simple text message to trigger a response
    const clientContent = {
        clientContent: {
            turns: [
                {
                    role: "user",
                    parts: [{ text: "Hello, can you hear me? Say yes." }]
                }
            ],
            turnComplete: true
        }
    };

    setTimeout(() => {
        console.log('Sending text prompt...');
        ws.send(JSON.stringify(clientContent));
    }, 1000);
});

ws.on('message', (data) => {
    try {
        const str = data.toString();
        const response = JSON.parse(str);

        console.log('Received message type:', Object.keys(response));

        if (response.serverContent?.modelTurn?.parts) {
            response.serverContent.modelTurn.parts.forEach(part => {
                if (part.text) {
                    console.log('Text response:', part.text);
                }
                if (part.inlineData) {
                    console.log('Audio chunk received! Size:', part.inlineData.data.length);
                }
            });
        }
    } catch (e) {
        console.log('Received binary or non-JSON data:', data.length, 'bytes');
    }
});

ws.on('error', (error) => {
    console.error('WebSocket Error:', error);
});

ws.on('close', (code, reason) => {
    console.log(`WebSocket Closed: ${code} - ${reason}`);
});
