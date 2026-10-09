// ============================================
// PRNT — Items Handler (List)
// ============================================
// Replaces: functions/api/items.js
// Routes:   GET /api/items
// Creates go through POST /api/input.

import { jsonResponse } from '../utils.js';

// ---- GET /api/items ----

export async function handleItemsList(env) {
  try {
    const itemsResult = await env.DB.prepare(`
      SELECT * FROM items
      WHERE deleted = 0
      ORDER BY 
        CASE WHEN completed = 1 THEN 1 ELSE 0 END,
        priority ASC NULLS LAST,
        due_date ASC NULLS LAST,
        created_at DESC
    `).all();

    const tagsResult = await env.DB.prepare(`SELECT item_id, tag FROM tags`).all();

    // Build a lookup: item_id → [tags]
    const tagsByItem = {};
    for (const row of tagsResult.results) {
      if (!tagsByItem[row.item_id]) tagsByItem[row.item_id] = [];
      tagsByItem[row.item_id].push(row.tag);
    }

    const items = itemsResult.results.map(item => ({
      ...item,
      completed: item.completed === 1,
      deleted: item.deleted === 1,
      tags: tagsByItem[item.id] || []
    }));

    return jsonResponse({ items });
  } catch (error) {
    console.error('Error fetching items:', error);
    return jsonResponse({ error: 'Failed to fetch items' }, 500);
  }
}
