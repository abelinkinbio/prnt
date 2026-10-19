// ============================================
// PRNT - Quotes Handler
// ============================================
// Powers the /quotes page. New quotes are saved
// by the $quotes command, not this API.
//
// GET    /api/quotes        → list all non-deleted quotes
// PATCH  /api/quotes/:id     → update (edit or favorite)
// DELETE /api/quotes/:id     → soft-delete a quote
// ============================================

import { jsonResponse, now } from '../utils.js';

// GET /api/quotes — every non-deleted quote, newest first
export async function handleQuotesList(env) {
  try {
    const result = await env.DB.prepare(`
      SELECT * FROM quotes
      WHERE deleted = 0
      ORDER BY created_at DESC
    `).all();

    return jsonResponse({
      quotes: result.results,
      total: result.results.length
    });
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return jsonResponse({ error: 'Failed to fetch quotes' }, 500);
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

    // Read back only a live row. A soft-deleted id must 404.
    const quote = await env.DB.prepare(
      `SELECT * FROM quotes WHERE id = ? AND deleted = 0`
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
