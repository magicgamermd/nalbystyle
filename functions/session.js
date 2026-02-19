// functions/session.js - Cloudflare Pages Function for secure token endpoints
// This provides secure access to API keys without exposing them in client code

/**
 * Environment variables needed (set in Cloudflare Pages dashboard):
 * - SONIOX_API_KEY
 * - OPENAI_API_KEY  
 * - ELEVENLABS_API_KEY
 * - ALLOWED_ORIGINS (comma-separated list of allowed origins, or * for any)
 */

// CORS headers
function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '*';
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || ['*'];
  
  const corsOrigin = allowedOrigins.includes('*') || allowedOrigins.includes(origin) 
    ? origin 
    : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// Handle CORS preflight
function handleCors(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request, env),
    });
  }
  return null;
}

// Verify request is authenticated (optional - add your own auth logic)
function verifyAuth(request, env) {
  // Add your authentication logic here
  // For example, check for a valid session token or API key
  const authHeader = request.headers.get('Authorization');
  
  // Example: Check for a bearer token
  // if (!authHeader || !authHeader.startsWith('Bearer ')) {
  //   return false;
  // }
  
  // For now, allow all requests (implement your own security)
  return true;
}

export async function onRequest(context) {
  const { request, env } = context;
  
  // Handle CORS
  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  // Only allow POST and GET
  if (request.method !== 'POST' && request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        ...getCorsHeaders(request, env),
        'Content-Type': 'application/json',
      },
    });
  }

  // Verify authentication (optional)
  if (!verifyAuth(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        ...getCorsHeaders(request, env),
        'Content-Type': 'application/json',
      },
    });
  }

  try {
    // Parse the URL to determine which token to return
    const url = new URL(request.url);
    const path = url.pathname;

    // Route based on path
    if (path.includes('/session/soniox')) {
      return await getSonioxToken(request, env);
    } else if (path.includes('/session/openai')) {
      return await getOpenAIToken(request, env);
    } else if (path.includes('/session/elevenlabs')) {
      return await getElevenLabsToken(request, env);
    } else if (path.includes('/session/all')) {
      return await getAllTokens(request, env);
    } else {
      // Default: return status
      return new Response(JSON.stringify({ 
        status: 'ok',
        endpoints: [
          '/session/soniox - Get Soniox WebSocket URL',
          '/session/openai - Get OpenAI token info',
          '/session/elevenlabs - Get ElevenLabs token',
          '/session/all - Get all tokens at once',
        ]
      }), {
        status: 200,
        headers: {
          ...getCorsHeaders(request, env),
          'Content-Type': 'application/json',
        },
      });
    }
  } catch (error) {
    console.error('Session error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: {
        ...getCorsHeaders(request, env),
        'Content-Type': 'application/json',
      },
    });
  }
}

// Get Soniox WebSocket configuration
async function getSonioxToken(request, env) {
  if (!env.SONIOX_API_KEY) {
    return new Response(JSON.stringify({ error: 'Soniox API key not configured' }), {
      status: 500,
      headers: {
        ...getCorsHeaders(request, env),
        'Content-Type': 'application/json',
      },
    });
  }

  // Soniox uses the API key directly in the WebSocket URL
  // We return a temporary session or the config needed
  const sessionId = generateSessionId();
  
  return new Response(JSON.stringify({
    success: true,
    sessionId,
    websocketUrl: `wss://api.soniox.com/transcribe-websocket`,
    // In production, you might want to implement a proxy or token exchange
    // For now, the client will use the API key directly
    config: {
      apiKeyPresent: true, // Client should have its own key or use a proxy
      recommendedLanguage: 'bg',
      recommendedSampleRate: 16000,
    }
  }), {
    status: 200,
    headers: {
      ...getCorsHeaders(request, env),
      'Content-Type': 'application/json',
    },
  });
}

// Get OpenAI configuration
async function getOpenAIToken(request, env) {
  if (!env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
      status: 500,
      headers: {
        ...getCorsHeaders(request, env),
        'Content-Type': 'application/json',
      },
    });
  }

  const sessionId = generateSessionId();
  
  // Return the API key securely (in production, consider a proxy)
  return new Response(JSON.stringify({
    success: true,
    sessionId,
    apiKey: env.OPENAI_API_KEY,
    model: 'gpt-4o',
    maxTokens: 300,
  }), {
    status: 200,
    headers: {
      ...getCorsHeaders(request, env),
      'Content-Type': 'application/json',
    },
  });
}

// Get ElevenLabs configuration
async function getElevenLabsToken(request, env) {
  if (!env.ELEVENLABS_API_KEY) {
    return new Response(JSON.stringify({ error: 'ElevenLabs API key not configured' }), {
      status: 500,
      headers: {
        ...getCorsHeaders(request, env),
        'Content-Type': 'application/json',
      },
    });
  }

  const sessionId = generateSessionId();
  
  // Get available voices
  let voices = [];
  try {
    const voicesResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
      },
    });
    
    if (voicesResponse.ok) {
      const voicesData = await voicesResponse.json();
      voices = voicesData.voices
        .filter(v => v.labels?.language === 'bg' || !v.labels?.language) // Bulgarian or multilingual
        .map(v => ({
          id: v.voice_id,
          name: v.name,
          previewUrl: v.preview_url,
        }));
    }
  } catch (e) {
    console.error('Failed to fetch voices:', e);
  }

  return new Response(JSON.stringify({
    success: true,
    sessionId,
    apiKey: env.ELEVENLABS_API_KEY,
    defaultVoiceId: 'JBFqnCBsd6RMkjVDRZzb', // Default alloy-like voice
    recommendedModel: 'eleven_multilingual_v2',
    voices,
  }), {
    status: 200,
    headers: {
      ...getCorsHeaders(request, env),
      'Content-Type': 'application/json',
    },
  });
}

// Get all tokens at once
async function getAllTokens(request, env) {
  const sessionId = generateSessionId();
  
  const tokens = {
    success: true,
    sessionId,
    soniox: env.SONIOX_API_KEY ? {
      configured: true,
      websocketUrl: 'wss://api.soniox.com/transcribe-websocket',
      language: 'bg',
      sampleRate: 16000,
    } : { configured: false },
    openai: env.OPENAI_API_KEY ? {
      configured: true,
      apiKey: env.OPENAI_API_KEY,
      model: 'gpt-4o',
    } : { configured: false },
    elevenlabs: env.ELEVENLABS_API_KEY ? {
      configured: true,
      apiKey: env.ELEVENLABS_API_KEY,
      defaultVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
      model: 'eleven_multilingual_v2',
    } : { configured: false },
  };

  return new Response(JSON.stringify(tokens), {
    status: 200,
    headers: {
      ...getCorsHeaders(request, env),
      'Content-Type': 'application/json',
    },
  });
}

// Generate a unique session ID
function generateSessionId() {
  return 'sess_' + Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Alternative: Proxy requests through Cloudflare (more secure)
// This keeps API keys on the server side only

export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Handle CORS
  const corsResponse = handleCors(request, env);
  if (corsResponse) return corsResponse;

  const url = new URL(request.url);
  
  // Proxy endpoint for Soniox (more secure - API key never reaches client)
  if (url.pathname.includes('/proxy/soniox')) {
    return await proxySoniox(request, env);
  }
  
  // Proxy endpoint for OpenAI
  if (url.pathname.includes('/proxy/openai')) {
    return await proxyOpenAI(request, env);
  }
  
  // Proxy endpoint for ElevenLabs
  if (url.pathname.includes('/proxy/elevenlabs')) {
    return await proxyElevenLabs(request, env);
  }

  return new Response(JSON.stringify({ error: 'Unknown proxy endpoint' }), {
    status: 404,
    headers: {
      ...getCorsHeaders(request, env),
      'Content-Type': 'application/json',
    },
  });
}

// Proxy Soniox requests (keeps API key secure)
async function proxySoniox(request, env) {
  if (!env.SONIOX_API_KEY) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500 });
  }

  // This would need to handle WebSocket upgrade for real-time streaming
  // For REST API calls:
  const body = await request.text();
  const response = await fetch('https://api.soniox.com/v1/transcribe', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SONIOX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      ...getCorsHeaders(request, env),
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    },
  });
}

// Proxy OpenAI requests
async function proxyOpenAI(request, env) {
  if (!env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500 });
  }

  const body = await request.text();
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      ...getCorsHeaders(request, env),
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    },
  });
}

// Proxy ElevenLabs requests
async function proxyElevenLabs(request, env) {
  if (!env.ELEVENLABS_API_KEY) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500 });
  }

  const url = new URL(request.url);
  const voiceId = url.searchParams.get('voiceId') || 'JBFqnCBsd6RMkjVDRZzb';
  
  const body = await request.text();
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body,
    }
  );

  return new Response(response.body, {
    status: response.status,
    headers: {
      ...getCorsHeaders(request, env),
      'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
    },
  });
}
