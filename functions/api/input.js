// ============================================
// PRNT API — Universal Input Endpoint
// POST /api/input
//
// This is the "front door" for all input.
// Every channel (web app, iOS, Raycast, email, API)
// sends raw text here, and the router figures out
// what to do with it.
//
// WHY A NEW ENDPOINT?
// Previously, the web app used POST /api/items (no auth,
// client-side parsing) and external channels used
// POST /api/ingest (API key, server-side parsing).
// Having two endpoints with two parsers meant bugs
// lived in one but not the other.
//
// Now there's one door: /api/input. The router
// handles everything. The old endpoints still work
// (backward compatibility) but internally they call
// the same router.
//
// AUTH:
// - Web app: no auth needed (same-origin requests)
// - External channels: pass X-API-Key header
// - If API key is present, we validate it
// - If absent, we let it through (web app case)
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

// POST /api/input — Process any input through the router
export async function onRequestPost(context) {
  const { request, env } = context;

  // ─── Auth Check (optional) ───
  // If an API key is provided, validate it.
  // If not provided, proceed without auth (web app).
  const apiKey = request.headers.get('X-API-Key')
    || request.headers.get('Authorization')?.replace('Bearer ', '');

  if (apiKey) {
    if (!env.PRNT_API_KEY) {
      return new Response(JSON.stringify({
        error: 'API key not configured on server'
      }), { status: 500, headers: corsHeaders() });
    }
    if (apiKey !== env.PRNT_API_KEY) {
      return new Response(JSON.stringify({
        error: 'Invalid API key'
      }), { status: 401, headers: corsHeaders() });
    }
  }

  try {
    const body = await request.json();

    // ─── Build the Envelope ───
    // The envelope is the standard input format that
    // every channel produces. It's the "package" that
    // the router opens to figure out what to do.
    const envelope = {
      raw: body.raw || '',
      source: body.source || 'web',
      meta: body.meta || {}
    };

    if (!envelope.raw.trim()) {
      return new Response(JSON.stringify({
        error: 'Input text is required (send as "raw" field)'
      }), { status: 400, headers: corsHeaders() });
    }

    // ─── Route It ───
    // The router inspects the raw text, finds the right
    // plugin, and runs parse → process → respond.
    const result = await routeEnvelope(envelope, env, context);

    // ─── Return Response ───
    // The router returns { command, message, item }.
    // We pass it through as the HTTP response body.
    if (result.error) {
      return new Response(JSON.stringify(result), {
        status: 400,
        headers: corsHeaders()
      });
    }

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Input processing error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to process input'
    }), { status: 500, headers: corsHeaders() });
  }
}
