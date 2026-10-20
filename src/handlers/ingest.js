import { jsonResponse } from '../utils.js';
import { routeAndSyncInput } from './input.js';

// POST /api/ingest
export async function handleIngest(request, env, ctx) {
  // --- API key check ---
  const apiKey = request.headers.get('X-API-Key')
    || request.headers.get('Authorization')?.replace('Bearer ', '');

  if (!env.PRNT_API_KEY) {
    return jsonResponse({
      error: 'API key not configured',
      message: 'Set PRNT_API_KEY environment variable'
    }, 500);
  }

  if (apiKey !== env.PRNT_API_KEY) {
    return jsonResponse({ error: 'Invalid API key' }, 401);
  }

  try {
    const body = await request.json();
    const { text, source = 'api' } = body;

    if (!text || !text.trim()) {
      return jsonResponse({ error: 'Text is required' }, 400);
    }

    const result = await routeAndSyncInput(text.trim(), env, ctx);

    return jsonResponse({
      ...result,
      source
    }, 201);
  } catch (error) {
    console.error('Ingest error:', error);
    return jsonResponse({ error: 'Failed to create item' }, 500);
  }
}
