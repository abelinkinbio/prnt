// ============================================
// PRNT API — Bookmarks Endpoint
// GET /api/bookmarks
//
// Returns all bookmarks with their tags.
// Powers the Bookmarks tab in the frontend.
//
// WHY A SEPARATE ENDPOINT?
// Bookmarks live in their own table (not items).
// Each plugin owns its own data, so each plugin
// gets its own read endpoint when the UI needs it.
// This is the pattern: $bookmark has /api/bookmarks,
// a future $review would have /api/reviews, etc.
// ============================================

// Helper: CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

// Handle OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/bookmarks — List all bookmarks
export async function onRequestGet(context) {
  const { env } = context;

  try {
    // Get all bookmarks, newest first
    const bookmarksResult = await env.DB.prepare(`
      SELECT * FROM bookmarks
      ORDER BY created_at DESC
    `).all();

    // Get all bookmark tags
    const tagsResult = await env.DB.prepare(`
      SELECT bookmark_id, tag FROM bookmark_tags
    `).all();

    // Build a map of bookmark_id → tags
    const tagsByBookmark = {};
    for (const row of tagsResult.results) {
      if (!tagsByBookmark[row.bookmark_id]) {
        tagsByBookmark[row.bookmark_id] = [];
      }
      tagsByBookmark[row.bookmark_id].push(row.tag);
    }

    // Attach tags to each bookmark
    const bookmarks = bookmarksResult.results.map(bm => ({
      ...bm,
      tags: tagsByBookmark[bm.id] || []
    }));

    return new Response(JSON.stringify({ bookmarks }), {
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Error fetching bookmarks:', error);

    // Graceful fallback if table doesn't exist yet
    return new Response(JSON.stringify({ bookmarks: [] }), {
      headers: corsHeaders()
    });
  }
}
