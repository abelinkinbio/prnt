// ============================================
// PRNT - Quotes Handler
// ============================================
// Powers the /quotes page and the $quotes command.
// Handles all quote operations:
//
// GET    /api/quotes        → list all quotes
// POST   /api/quotes        → create a new quote
// GET    /api/quotes/random  → get a random quote
// GET    /api/quotes/:id     → get single quote
// PATCH  /api/quotes/:id     → update (edit or favorite)
// DELETE /api/quotes/:id     → soft-delete a quote
// ============================================

import { jsonResponse, generateId, now } from '../utils.js';

// GET /api/quotes — list all non-deleted quotes
export async function handleQuotesList(request, env) {
  try {
    const url = new URL(request.url);

    // Optional query params for filtering
    const favoritesOnly = url.searchParams.get('favorites') === 'true';
    const limit = parseInt(url.searchParams.get('limit')) || 100;

    let sql = `
      SELECT * FROM quotes 
      WHERE deleted = 0
    `;
    const params = [];

    if (favoritesOnly) {
      sql += ` AND favorite = 1`;
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const result = await env.DB.prepare(sql).bind(...params).all();

    return jsonResponse({
      quotes: result.results,
      total: result.results.length
    });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return jsonResponse({ error: 'Failed to fetch quotes' }, 500);
  }
}

// POST /api/quotes — create a new quote
export async function handleQuotesCreate(request, env) {
  try {
    const body = await request.json();
    const {
      quote_text,
      attribution = null,
      source = null,
      source_input = 'web',
      raw_input = null
    } = body;

    if (!quote_text || !quote_text.trim()) {
      return jsonResponse({ error: 'quote_text is required' }, 400);
    }

    const id = generateId('quote');
    const timestamp = now();

    await env.DB.prepare(`
      INSERT INTO quotes (id, quote_text, attribution, source, favorite, ai_attributed, source_input, raw_input, created_at, updated_at, deleted)
      VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 0)
    `).bind(
      id,
      quote_text.trim(),
      attribution,
      source,
      source_input,
      raw_input || quote_text,
      timestamp,
      timestamp
    ).run();

    const newQuote = {
      id,
      quote_text: quote_text.trim(),
      attribution,
      source,
      favorite: 0,
      ai_attributed: 0,
      source_input,
      raw_input: raw_input || quote_text,
      created_at: timestamp,
      updated_at: timestamp,
      deleted: 0
    };

    return jsonResponse({ quote: newQuote }, 201);
  } catch (error) {
    console.error('Error creating quote:', error);
    return jsonResponse({ error: 'Failed to create quote' }, 500);
  }
}

// GET /api/quotes/random — get a random non-deleted quote
export async function handleQuotesRandom(env) {
  try {
    // SQLite's RANDOM() function picks a random row.
    // This is efficient even with many rows because
    // SQLite only needs to scan one row, not sort all of them.
    const quote = await env.DB.prepare(`
      SELECT * FROM quotes
      WHERE deleted = 0
      ORDER BY RANDOM()
      LIMIT 1
    `).first();

    if (!quote) {
      return jsonResponse({ error: 'No quotes found' }, 404);
    }

    return jsonResponse({ quote });
  } catch (error) {
    console.error('Error fetching random quote:', error);
    return jsonResponse({ error: 'Failed to fetch random quote' }, 500);
  }
}

// GET /api/quotes/:id — get a single quote
export async function handleQuoteGet(env, quoteId) {
  try {
    const quote = await env.DB.prepare(`
      SELECT * FROM quotes WHERE id = ? AND deleted = 0
    `).bind(quoteId).first();

    if (!quote) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    return jsonResponse({ quote });
  } catch (error) {
    console.error('Error fetching quote:', error);
    return jsonResponse({ error: 'Failed to fetch quote' }, 500);
  }
}

// PATCH /api/quotes/:id — update a quote (edit text, toggle favorite, etc.)
export async function handleQuoteUpdate(request, env, quoteId) {
  try {
    const body = await request.json();
    const updates = [];
    const values = [];

    // Only allow updating specific fields
    const allowedFields = [
      'quote_text',
      'attribution',
      'source',
      'favorite'
    ];

    for (const field of allowedFields) {
      if (body.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    if (updates.length === 0) {
      return jsonResponse({ error: 'No valid fields to update' }, 400);
    }

    // Always update the timestamp
    updates.push('updated_at = ?');
    values.push(now());

    // Add quote ID for the WHERE clause
    values.push(quoteId);

    await env.DB.prepare(
      `UPDATE quotes SET ${updates.join(', ')} WHERE id = ? AND deleted = 0`
    ).bind(...values).run();

    // Return the updated quote
    const quote = await env.DB.prepare(
      `SELECT * FROM quotes WHERE id = ?`
    ).bind(quoteId).first();

    if (!quote) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    return jsonResponse({ quote });
  } catch (error) {
    console.error('Error updating quote:', error);
    return jsonResponse({ error: 'Failed to update quote' }, 500);
  }
}

// DELETE /api/quotes/:id — soft-delete a quote
// (Sets deleted = 1 instead of actually removing the row.
//  This matches the pattern used in items.js for tasks/notes.)
export async function handleQuoteDelete(env, quoteId) {
  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM quotes WHERE id = ? AND deleted = 0`
    ).bind(quoteId).first();

    if (!existing) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    await env.DB.prepare(`
      UPDATE quotes SET deleted = 1, updated_at = ? WHERE id = ?
    `).bind(now(), quoteId).run();

    return jsonResponse({ success: true, id: quoteId });
  } catch (error) {
    console.error('Error deleting quote:', error);
    return jsonResponse({ error: 'Failed to delete quote' }, 500);
  }
}
