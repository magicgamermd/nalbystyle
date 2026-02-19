// GET /api-keys — securely provides API keys to the frontend
// These are set as Cloudflare Pages secrets, not exposed in code
export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    soniox: env.SONIOX_API_KEY,
    openai: env.OPENAI_API_KEY,
    elevenlabs: env.ELEVENLABS_API_KEY,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
