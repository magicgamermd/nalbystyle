// POST /log — receives transcript events from the frontend
// Logs are visible in Cloudflare Pages Function logs (Real-time Logs in dashboard)
export async function onRequestPost({ request }) {
  try {
    const body = await request.json();
    const { role, text, sessionId } = body;
    
    // This appears in Cloudflare's Real-time Logs
    console.log(`[${sessionId || 'unknown'}] [${role}]: ${text}`);
    
    return new Response('ok', { 
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response('error', { status: 400 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
