// ============================================
// PRNT API — Bookmarks Endpoint
// ============================================
//
// GET    /api/bookmarks     → List all bookmarks
// DELETE /api/bookmarks/:id → Delete a bookmark (via query param)
//
// This is a read/delete endpoint for the Bookmarks tab.
// Creation happens through the plugin system ($bookmark command).
//
// WHY A SEPARATE ENDPOINT?
// The plugin system handles creation (capture → route → execute).
// But the UI needs a way to LIST and DELETE bookmarks.
// This follows the same pattern as items.js (which has
// GET for listing and items/[id].js for individual operations).
// ============================================

// Helper: CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
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

    // Build a lookup map: bookmark_id → [tags]
    const tagsByBookmark = {};
    for (const row of tagsResult.results) {
      if (!tagsByBookmark[row.bookmark_id]) {
        tagsByBookmark[row.bookmark_id] = [];
      }
      tagsByBookmark[row.bookmark_id].push(row.tag);
    }

    // Attach tags to bookmarks
    const bookmarks = bookmarksResult.results.map(bk => ({
      ...bk,
      tags: tagsByBookmark[bk.id] || []
    }));

    return new Response(JSON.stringify({ bookmarks }), {
      headers: corsHeaders()
    });
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch bookmarks' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// DELETE /api/bookmarks?id=xxx — Delete a bookmark
export async function onRequestDelete(context) {
  const { env, request } = context;

  try {
    const url = new URL(request.url);
    const bookmarkId = url.searchParams.get('id');

    if (!bookmarkId) {
      return new Response(JSON.stringify({ error: 'Bookmark ID is required' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // Delete tags first (foreign key)
    await env.DB.prepare(`DELETE FROM bookmark_tags WHERE bookmark_id = ?`).bind(bookmarkId).run();

    // Delete bookmark
    await env.DB.prepare(`DELETE FROM bookmarks WHERE id = ?`).bind(bookmarkId).run();

    return new Response(JSON.stringify({ success: true, id: bookmarkId }), {
      headers: corsHeaders()
    });
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete bookmark' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
