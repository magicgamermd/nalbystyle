// functions/session.js — Cloudflare Pages Function
// Creates an OpenAI Realtime ephemeral session and returns client_secret

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function buildSystemPrompt() {
  // Sofia time
  const now = new Date(Date.now() + 2 * 3600_000); // approximate UTC+2
  const hh = now.getUTCHours(), mm = now.getUTCMinutes();
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${pad(hh)}:${pad(mm)}`;
  const dayNames = ['неделя','понеделник','вторник','сряда','четвъртък','петък','събота'];
  const dayName = dayNames[now.getUTCDay()];

  return `Ти си гласов асистент на бръснарница "Налби Стайл" в град Троян, България.

СТИЛ НА ГОВОРЕНЕ:
- Говори САМО на български
- Кратки отговори — 1–2 изречения максимум
- Приятелски и спокоен тон, като готин приятел
- НЕ казвай "Здравейте, как мога да ви помогна" — кажи нещо като "Здравей! Налби Стайл, какво ще правим?"

ИНФОРМАЦИЯ ЗА САЛОНА:
- Работно време: Понеделник–Събота 09:00–19:00, Неделя — почивен ден
- Адрес: ул. Васил Левски 45, Троян
- Сега е ${dayName}, ${timeStr} часа (София)
- Услуги: подстригване мъже (20лв), бръснене (15лв), комбо подстригване+бръснене (30лв), оформяне на брада (12лв), детско подстригване до 12г (15лв)

ЗАПИСВАНЕ НА ЧАС:
Стъпки (следвай ги една по една):
1. Питай за УСЛУГА — каква услуга желае?
2. Питай за ПРЕДПОЧИТАН ДЕН И ЧАС — кога му е удобно?
3. Питай за ИМЕ — на какво име да запишем?
4. Питай за ТЕЛЕФОНЕН НОМЕР — за потвърждение

ТЕЛЕФОНЕН НОМЕР — КРИТИЧНО ВАЖНО:
- Когато клиентът казва номер, изчакай го да довърши — НЕ го прекъсвай!
- Българските номера имат 10 цифри (обикновено започват с 08)
- Ако чуеш по-малко от 10 цифри, попитай: "Останалите цифри?"
- ВИНАГИ повтори номера цифра по цифра за потвърждение: "Значи нула осем седем девет, нула шест нула, осем едно три — правилно ли е?"
- Ако клиентът каже "да" — продължи. Ако каже "не" — помоли го да повтори целия номер

5. Обобщи записването и потвърди

ВАЖНО:
- Ако питат нещо извън записване — отговори кратко и върни разговора към записването
- Ако салонът е затворен в момента — предложи следващия работен ден`;
}

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
  }

  if (!env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set' }), {
      status: 500,
      headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json' },
    });
  }

  try {
    // Create ephemeral Realtime session via OpenAI API
    const sessionConfig = {
      model: 'gpt-4o-realtime-preview',
      voice: 'verse',
      instructions: buildSystemPrompt(),
      input_audio_transcription: {
        model: 'gpt-4o-mini-transcribe',
      },
      turn_detection: {
        type: 'semantic_vad',
        eagerness: 'medium',
      },
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
    };

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionConfig),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI session error:', response.status, errText);
      return new Response(JSON.stringify({ error: 'Failed to create session', detail: errText }), {
        status: response.status,
        headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json' },
      });
    }

    const sessionData = await response.json();

    // Return ephemeral client_secret to the frontend
    return new Response(JSON.stringify(sessionData), {
      status: 200,
      headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Session creation failed:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json' },
    });
  }
}
