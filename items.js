// ============================================
// PRNT API — Items Endpoint
// ============================================
//
// GET  /api/items     → List all items (unchanged)
// POST /api/items     → Create item via plugin router
//
// WHAT CHANGED (Plugin System):
// The POST handler used to parse input client-side and
// receive pre-structured data. Now it accepts EITHER:
//
// 1. Raw text (new way): { raw: "Review PR @today p0" }
//    → Routes through the plugin system
//    → Supports $commands
//
// 2. Pre-parsed data (backward compatible): { content, type, priority, ... }
//    → Falls through to default handler
//    → Preserves existing web app behavior during transition
//
// The GET handler is completely unchanged.
// ============================================

import { routeEnvelope } from './_router.js';

// Helper: CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

// Handle OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/items — List all items
// This is completely unchanged from the original.
export async function onRequestGet(context) {
  const { env } = context;

  try {
    // Get all items, sorted: incomplete first, then by priority, then by date
    const itemsResult = await env.DB.prepare(`
      SELECT * FROM items
      ORDER BY
        CASE WHEN completed = 1 THEN 1 ELSE 0 END,
        priority ASC NULLS LAST,
        due_date ASC NULLS LAST,
        created_at DESC
    `).all();

    // Get all tags
    const tagsResult = await env.DB.prepare(`
      SELECT item_id, tag FROM tags
    `).all();

    // Build a lookup map: item_id → [tags]
    const tagsByItem = {};
    for (const row of tagsResult.results) {
      if (!tagsByItem[row.item_id]) {
        tagsByItem[row.item_id] = [];
      }
      tagsByItem[row.item_id].push(row.tag);
    }

    // Attach tags to items and convert SQLite integers to booleans
    const items = itemsResult.results.map(item => ({
      ...item,
      completed: item.completed === 1,
      deleted: item.deleted === 1,
      tags: tagsByItem[item.id] || []
    }));

    return new Response(JSON.stringify({ items }), { headers: corsHeaders() });
  } catch (error) {
    console.error('Error fetching items:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch items' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// POST /api/items — Create new item (now routes through plugin system)
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    // Check if this is a "raw" input (new plugin-aware way)
    // or a pre-parsed input (backward compatible way)
    if (body.raw) {
      // ── New way: raw text goes through the router ──
      // The frontend sends: { raw: "$bookmark https://...", source: "web" }
      // Or: { raw: "Review PR @today p0 #frontend", source: "web" }
      const envelope = {
        raw: body.raw,
        source: body.source || 'web',
        meta: body.meta || {}
      };

      const result = await routeEnvelope(envelope, env, context);

      return new Response(JSON.stringify(result.body), {
        status: result.status || 200,
        headers: corsHeaders()
      });
    }

    // ── Backward compatible: pre-parsed data ──
    // The frontend currently sends: { content, type, priority, due_date, ... }
    // We wrap this in an envelope using the raw_input field
    // and route it through the default handler.
    const rawText = body.raw_input || body.content || '';
    const envelope = {
      raw: rawText,
      source: 'web',
      meta: {}
    };

    const result = await routeEnvelope(envelope, env, context);

    return new Response(JSON.stringify(result.body), {
      status: result.status || 200,
      headers: corsHeaders()
    });
  } catch (error) {
    console.error('Error creating item:', error);
    return new Response(JSON.stringify({ error: 'Failed to create item' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
