// ============================================
// PRNT API — Universal Input Endpoint
// ============================================
//
// POST /api/input — The single entry point for all input
//
// This is the "front door" of the plugin system.
// Every input channel can use this endpoint:
//
//   Web app:      { raw: "Review PR @today p0", source: "web" }
//   iOS Shortcut: { raw: "$bookmark https://...", source: "ios-shortcut" }
//   Raycast:      { raw: "$review Coffee Shop — 9/10", source: "raycast" }
//   Email:        { raw: "Pick up milk @tmrw", source: "email" }
//
// Authentication:
//   - If X-API-Key header is present, validate it (for external channels)
//   - If no API key, allow the request (for the web app)
//
// WHY THIS EXISTS:
// Before the plugin system, the web app used /api/items and
// external channels used /api/ingest. Both had their own parsers.
// This endpoint unifies them: one door, one router, one parser.
//
// The old endpoints still work for backward compatibility,
// but new code should use this one.
// ============================================

import { routeEnvelope } from './_router.js';

// Helper: CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Content-Type': 'application/json'
  };
}

// Handle OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// POST /api/input — Route input through the plugin system
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // ── Optional authentication ──
    // If an API key is provided, validate it.
    // If no API key, allow the request (web app doesn't need one).
    const apiKey = request.headers.get('X-API-Key')
      || request.headers.get('Authorization')?.replace('Bearer ', '');

    if (apiKey) {
      if (!env.PRNT_API_KEY || apiKey !== env.PRNT_API_KEY) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
          status: 401,
          headers: corsHeaders()
        });
      }
    }

    const body = await request.json();
    const { raw, source = 'web', meta = {} } = body;

    if (!raw || !raw.trim()) {
      return new Response(JSON.stringify({ error: 'Raw text is required' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // ── Build the envelope ──
    const envelope = {
      raw: raw.trim(),
      source,
      meta: {
        ...meta,
        api_key_used: !!apiKey,
        timestamp: new Date().toISOString()
      }
    };

    // ── Route through the plugin system ──
    const result = await routeEnvelope(envelope, env, context);

    return new Response(JSON.stringify(result.body), {
      status: result.status || 200,
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Input error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process input' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
