import { jsonResponse } from '../utils.js';

export async function handleBookmarksList(env) {
  try {
    const bookmarksResult = await env.DB.prepare(`
      SELECT * FROM bookmarks
      ORDER BY created_at DESC
    `).all();

    const tagsResult = await env.DB.prepare(`
      SELECT bookmark_id, tag FROM bookmark_tags
    `).all();

    const tagsByBookmark = {};
    for (const row of tagsResult.results) {
      if (!tagsByBookmark[row.bookmark_id]) {
        tagsByBookmark[row.bookmark_id] = [];
      }
      tagsByBookmark[row.bookmark_id].push(row.tag);
    }

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

export async function handleBookmarkDelete(request, env) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: 'Missing id parameter' }, 400);
    }

    const existing = await env.DB.prepare(
      `SELECT id FROM bookmarks WHERE id = ?`
    ).bind(id).first();

    if (!existing) {
      return jsonResponse({ error: 'Bookmark not found' }, 404);
    }

    await env.DB.prepare(
      `DELETE FROM bookmarks WHERE id = ?`
    ).bind(id).run();

    return jsonResponse({ success: true, id });
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    return jsonResponse({ error: 'Failed to delete bookmark' }, 500);
  }
}
