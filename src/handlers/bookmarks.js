// ============================================
// PRNT - Bookmarks Handler
// ============================================
// Handles reading and deleting bookmarks.
// Bookmarks are created by the $bookmark command
// (handled in the plugin system / ingest route),
// so this file only needs GET and DELETE.
//
// GET  /api/bookmarks     → list all bookmarks
// DELETE /api/bookmarks?id=xxx → delete one bookmark
// ============================================

import { jsonResponse } from '../utils.js';

// GET /api/bookmarks — list all bookmarks with their tags
export async function handleBookmarksList(env) {
  try {
    // Get all bookmarks, newest first
    const bookmarksResult = await env.DB.prepare(`
      SELECT * FROM bookmarks
      ORDER BY created_at DESC
    `).all();

    // Get all bookmark tags in one query
    const tagsResult = await env.DB.prepare(`
      SELECT bookmark_id, tag FROM bookmark_tags
    `).all();

    // Group tags by bookmark_id
    // (same pattern used in items.js for item tags)
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

    return jsonResponse({ bookmarks });
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    return jsonResponse({ error: 'Failed to fetch bookmarks' }, 500);
  }
}

// DELETE /api/bookmarks?id=xxx — delete a bookmark and its tags
export async function handleBookmarkDelete(request, env) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: 'Missing id parameter' }, 400);
    }

    // Check if bookmark exists
    const existing = await env.DB.prepare(
      `SELECT id FROM bookmarks WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return jsonResponse({ error: 'Bookmark not found' }, 404);
    }

    // Delete tags first (foreign key relationship),
    // then delete the bookmark itself
    await env.DB.prepare(
      `DELETE FROM bookmark_tags WHERE bookmark_id = ?`
    ).bind(id).run();

    await env.DB.prepare(
      `DELETE FROM bookmarks WHERE id = ?`
    ).bind(id).run();

    return jsonResponse({ success: true, id });
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    return jsonResponse({ error: 'Failed to delete bookmark' }, 500);
  }
}
