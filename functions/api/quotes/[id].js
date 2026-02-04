// ============================================
// PRNT API - Individual Quote Endpoint
// GET, PATCH, DELETE for single quotes
// Handles: /api/quotes/:id
// ============================================

// Helper: CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

// Helper: Get current ISO timestamp
function now() {
  return new Date().toISOString();
}

// Handle OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/quotes/:id - Get a single quote
export async function onRequestGet(context) {
  const { env, params } = context;
  const quoteId = params.id;
  
  try {
    const result = await env.DB.prepare(`
      SELECT * FROM quotes WHERE id = ?
    `).bind(quoteId).first();
    
    if (!result) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), {
        status: 404,
        headers: corsHeaders()
      });
    }
    
    const quote = {
      ...result,
      favorite: result.favorite === 1,
      ai_attributed: result.ai_attributed === 1,
      deleted: result.deleted === 1
    };
    
    return new Response(JSON.stringify({ quote }), { headers: corsHeaders() });
    
  } catch (error) {
    console.error('Error fetching quote:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch quote' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// PATCH /api/quotes/:id - Update a quote
// Use cases:
//   - Edit the quote text, attribution, or source
//   - Toggle favorite status
//   - Soft delete (set deleted = true)
//   - Restore (set deleted = false)
export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const quoteId = params.id;
  
  try {
    const body = await request.json();
    
    // Build dynamic update query
    // This pattern lets us update only the fields that are provided
    const updates = [];
    const values = [];
    
    // List of fields that can be updated
    const allowedFields = [
      'quote_text',
      'attribution', 
      'source',
      'favorite',
      'deleted'
    ];
    
    for (const field of allowedFields) {
      if (body.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        // Convert booleans to integers for SQLite
        if (field === 'favorite' || field === 'deleted') {
          values.push(body[field] ? 1 : 0);
        } else {
          values.push(body[field]);
        }
      }
    }
    
    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
        status: 400,
        headers: corsHeaders()
      });
    }
    
    // Always update the timestamp when making changes
    updates.push('updated_at = ?');
    values.push(now());
    
    // Add quote ID for the WHERE clause
    values.push(quoteId);
    
    // Execute the update
    const updateQuery = `UPDATE quotes SET ${updates.join(', ')} WHERE id = ?`;
    await env.DB.prepare(updateQuery).bind(...values).run();
    
    // Fetch and return the updated quote
    const result = await env.DB.prepare(`
      SELECT * FROM quotes WHERE id = ?
    `).bind(quoteId).first();
    
    if (!result) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), {
        status: 404,
        headers: corsHeaders()
      });
    }
    
    const quote = {
      ...result,
      favorite: result.favorite === 1,
      ai_attributed: result.ai_attributed === 1,
      deleted: result.deleted === 1
    };
    
    return new Response(JSON.stringify({ 
      success: true,
      quote 
    }), { headers: corsHeaders() });
    
  } catch (error) {
    console.error('Error updating quote:', error);
    return new Response(JSON.stringify({ error: 'Failed to update quote' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// DELETE /api/quotes/:id - Permanently delete a quote
// Note: Use PATCH with {deleted: true} for soft delete instead
// This is a hard delete that permanently removes the quote
export async function onRequestDelete(context) {
  const { env, params } = context;
  const quoteId = params.id;
  
  try {
    // Check if quote exists first
    const existing = await env.DB.prepare(`
      SELECT id FROM quotes WHERE id = ?
    `).bind(quoteId).first();
    
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), {
        status: 404,
        headers: corsHeaders()
      });
    }
    
    // Permanently delete the quote
    await env.DB.prepare(`DELETE FROM quotes WHERE id = ?`).bind(quoteId).run();
    
    return new Response(JSON.stringify({ 
      success: true,
      deleted_id: quoteId,
      message: 'Quote permanently deleted'
    }), { headers: corsHeaders() });
    
  } catch (error) {
    console.error('Error deleting quote:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete quote' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
