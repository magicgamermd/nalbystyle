export async function onRequestGet({ env }) {
  const OPENAI_API_KEY = env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const SYSTEM_PROMPT = `Ти си Наби от Налби Стайл барбершоп в София. Говориш САМО на български. Стил: кратко, живо, като приятел.

ВАЖНО: Започни разговора сам с: "Здрасти, Налби Стайл — казвай!"

УСЛУГИ: Подстригване 25лв/30мин | Брада 20лв/20мин | И двете 40лв/50мин | Детско 20лв/20мин
РАБОТНО ВРЕМЕ: Пон-Пет 10-20ч, Съб 10-18ч, Нед — почиваме.

FLOW (строго спазвай — по 1 въпрос):
1. Разбери услугата
2. Ден
3. Час
4. Име
5. Телефон → повтори → изчакай "да"
6. "Готово! [услуга] за [ден] в [час]. Чакаме те, [Име]!"

ТЕЛЕФОН: Събери всички цифри в 10-цифрено число и повтори: "0893... — така ли?"
ЗАБРАНЕНО: "разбира се", "разбрано", "с удоволствие", "перфектно".`;

  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-realtime-preview',
        voice: 'verse',
        instructions: SYSTEM_PROMPT,
        input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
        },
      }),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
