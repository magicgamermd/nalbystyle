# Voice Agent Hybrid for Bulgarian Barbershop

A React/TypeScript voice agent component for booking appointments at a Bulgarian barbershop. Uses WebSocket streaming for real-time speech-to-text with Soniox, GPT-4o for conversational AI, and ElevenLabs for text-to-speech.

## Features

- 🎙️ **Real-time STT**: Soniox WebSocket streaming with Bulgarian language support
- 🧠 **AI Conversation**: GPT-4o with Bulgarian system prompts
- 🔊 **Natural TTS**: ElevenLabs multilingual v2 with Bulgarian voices
- ⏱️ **VAD**: Voice Activity Detection with 1.2s silence threshold
- 🚫 **Barge-in**: Users can interrupt the AI while speaking
- 📅 **Booking Flow**: Service → Date/Time → Name → Phone → Confirmation
- 🎨 **Modern UI**: Animated audio visualizer and progress indicators

## Stack

- **STT**: Soniox API (WebSocket streaming)
- **LLM**: OpenAI GPT-4o
- **TTS**: ElevenLabs API (multilingual v2)
- **Frontend**: React + TypeScript
- **Audio**: Web Audio API + WebSocket
- **Backend**: Cloudflare Pages Functions (optional token proxy)

## Installation

```bash
npm install
# or
yarn install
```

## Usage

### Basic Usage

```tsx
import { VoiceAgentHybrid } from './VoiceAgentHybrid';

function App() {
  return (
    <VoiceAgentHybrid
      sonioxApiKey="your-soniox-key"
      openaiApiKey="your-openai-key"
      elevenLabsApiKey="your-elevenlabs-key"
      voiceId="JBFqnCBsd6RMkjVDRZzb"
    />
  );
}
```

### With Booking Callback

```tsx
import { VoiceAgentHybridIntegrated } from './VoiceAgentHybridIntegrated';
import { BookingData } from './types';

function App() {
  const handleBookingComplete = (bookingData: BookingData) => {
    console.log('Booking complete:', bookingData);
    // Send to your backend, save to database, etc.
  };

  return (
    <VoiceAgentHybridIntegrated
      sonioxApiKey={process.env.REACT_APP_SONIOX_KEY}
      openaiApiKey={process.env.REACT_APP_OPENAI_KEY}
      elevenLabsApiKey={process.env.REACT_APP_ELEVENLABS_KEY}
      barbershopName="Blade & Bourbon"
      onBookingComplete={handleBookingComplete}
    />
  );
}
```

### Secure Token Endpoint (Recommended)

Use the Cloudflare Pages Function to keep API keys secure:

```typescript
// In your component
const [apiKeys, setApiKeys] = useState(null);

useEffect(() => {
  fetch('/session/all')
    .then(r => r.json())
    .then(setApiKeys);
}, []);

// Then pass the keys to the component
```

Set environment variables in Cloudflare Pages dashboard:
- `SONIOX_API_KEY`
- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `ALLOWED_ORIGINS` (optional, comma-separated)

## File Structure

```
/tmp/nalbystyle/blade-bourbon-studio/
├── VoiceAgentHybrid.tsx              # Main component (basic)
├── VoiceAgentHybridIntegrated.tsx    # Full-featured component
├── types.ts                          # TypeScript definitions
├── index.ts                          # Barrel exports
├── hooks/
│   ├── index.ts                      # Hook exports
│   ├── useAudioCapture.ts            # Microphone capture
│   ├── useSonioxSTT.ts              # Soniox WebSocket STT
│   ├── useElevenLabsTTS.ts          # ElevenLabs TTS
│   └── useConversation.ts           # Booking flow state
└── functions/
    └── session.js                    # Cloudflare token endpoints
```

## Conversation Flow

1. **Greeting**: AI introduces itself and asks for the desired service
2. **Service**: User selects service (haircut, shave, combo, beard trim)
3. **Date/Time**: User provides preferred date and time
4. **Name**: User provides their name
5. **Phone**: User provides phone number
6. **Confirmation**: AI confirms all details before finalizing

## API Keys

### Soniox
- Sign up at [soniox.com](https://soniox.com)
- Bulgarian language code: `bg`
- WebSocket endpoint: `wss://api.soniox.com/transcribe-websocket`

### OpenAI
- Get key at [platform.openai.com](https://platform.openai.com)
- Model: `gpt-4o`

### ElevenLabs
- Get key at [elevenlabs.io](https://elevenlabs.io)
- Recommended model: `eleven_multilingual_v2`
- Bulgarian-compatible voices: alloy, echo, or custom voices

## Environment Variables

```bash
# .env.local (for local development)
REACT_APP_SONIOX_API_KEY=your_key_here
REACT_APP_OPENAI_API_KEY=your_key_here
REACT_APP_ELEVENLABS_API_KEY=your_key_here

# Cloudflare Pages (production)
SONIOX_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## Customization

### Services

Edit `SERVICES` in `types.ts`:

```typescript
export const SERVICES: ServiceOption[] = [
  {
    id: 'haircut',
    name: 'Haircut',
    nameBg: 'Подстригване',
    price: 40,
    duration: 30,
    description: 'Classic haircut',
    descriptionBg: 'Класическо подстригване',
  },
  // Add more services...
];
```

### System Prompt

Edit the system prompt in `VoiceAgentHybridIntegrated.tsx`:

```typescript
const systemPrompt = `Ти си виртуален асистент за барбершоп "${barbershopName}"...
`;
```

### Styling

The components use inline styles for easy portability. Override by:

1. Wrapping in a styled component
2. Using CSS with higher specificity
3. Modifying the style tags in the component

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

Requires:
- Web Audio API
- WebSocket
- MediaDevices API (getUserMedia)

## Troubleshooting

### Microphone not working
- Check browser permissions
- Ensure HTTPS (required for getUserMedia)
- Try refreshing the page

### STT not recognizing Bulgarian
- Verify `language: 'bg'` is set in Soniox config
- Check Soniox API key is valid
- Ensure audio sample rate is 16000 Hz

### TTS sounds robotic
- Try different voice IDs in ElevenLabs
- Adjust `stability` and `similarityBoost` settings
- Use `eleven_multilingual_v2` model for best quality

### High latency
- Use WebSocket streaming (already implemented)
- Reduce `max_tokens` in GPT-4o calls
- Enable `optimize_streaming_latency` in ElevenLabs

## License

MIT
