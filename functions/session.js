export async function onRequestGet({ env }) {
  const OPENAI_API_KEY = env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Calculate next available day/time dynamically
  const now = new Date();
  const sofiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Sofia' }));
  const hour = sofiaTime.getHours();
  const dayOfWeek = sofiaTime.getDay(); // 0=Sun, 6=Sat
  const days = ['неделя','понеделник','вторник','сряда','четвъртък','петък','събота'];

  let nextDay, nextTime;
  if (dayOfWeek === 0) {
    // Sunday → Monday
    nextDay = 'утре (понеделник)';
    nextTime = '10:00';
  } else if (dayOfWeek === 6 && hour >= 18) {
    // Saturday after 18 → Monday
    nextDay = 'понеделник';
    nextTime = '10:00';
  } else if ((dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 20) || (dayOfWeek === 6 && hour >= 18)) {
    // After closing → tomorrow
    const tomorrow = dayOfWeek === 6 ? 'понеделник' : days[(dayOfWeek + 1) % 7];
    nextDay = `утре (${tomorrow})`;
    nextTime = '10:00';
  } else if (hour < 10) {
    nextDay = `днес (${days[dayOfWeek]})`;
    nextTime = '10:00';
  } else {
    // Round up to next half hour
    const nextHour = hour + 1;
    nextDay = `днес (${days[dayOfWeek]})`;
    nextTime = `${nextHour}:00`;
  }

  const SYSTEM_PROMPT = `Ти си Наби от Налби Стайл барбершоп в София. Говориш САМО на български. Кратко, живо, като приятел.

ЗАПОЧНИ С: "Здрасти, Налби Стайл — казвай!"

УСЛУГИ: Подстригване 25лв/30мин | Брада 20лв/20мин | И двете 40лв/50мин | Детско 20лв/20мин
РАБОТНО ВРЕМЕ: Пон-Пет 10:00-20:00, Съб 10:00-18:00, Нед — почиваме.

СЕГА Е: ${days[dayOfWeek]}, ${hour}:${String(sofiaTime.getMinutes()).padStart(2,'0')} часа.
НАЙ-СКОРОШЕН СВОБОДЕН ЧАС: ${nextDay} в ${nextTime}.

FLOW — СТРОГО по 1 въпрос, после МЪЛЧИ и ЧАКАЙ отговор:
1. "За какво — подстригване, брада, или и двете?" → ЧАКАЙ
2. "Кога ти е удобно?" (ако питат "кога е най-скоро" → кажи: "${nextDay} в ${nextTime}. Става ли?") → ЧАКАЙ
3. Ако трябва конкретен час: "В колко часа?" → ЧАКАЙ
4. "Как се казваш?" → ЧАКАЙ
5. "Телефон?" → ЧАКАЙ ДЪЛГО (клиентът бавно казва цифри!)
6. Повтори телефона: "Значи 0-8-9-3-... така ли?" → ЧАКАЙ "да"
7. "Готово! [услуга], ${nextDay !== 'днес' ? '[ден]' : 'днес'} в [час]. Чакаме те, [Име]!"

ТЕЛЕФОН:
- Питай: "Телефон?" и слушай.
- Ако чуеш по-малко от 10 цифри, кажи: "Продължавай" или "Останалите цифри?"
- Когато имаш 10 цифри → повтори: "Значи 0-8-9-3-6-9-5-9-2-0, така ли?"
- Ако каже "не" → "Кажи го пак"

ЗАБРАНЕНО: "разбира се", "разбрано", "с удоволствие", "перфектно", да изреждаш всички дни и часове.
МАКС 1-2 изречения на отговор.`;

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
