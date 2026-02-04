// ============================================
// PRNT — $bookmark Command Plugin
// ============================================
//
// Save a URL with optional notes and tags.
//
// FORMAT:
//   $bookmark https://example.com — great article about system design
//   $bookmark https://example.com #design #reading — must read
//
// PARSE:
//   - Extract the first URL-shaped string
//   - Everything after "—" (em dash or double hyphen) is the note
//   - Also extract any #tags
//
// PROCESS:
//   - Store in the `bookmarks` table in D1
//   - Store tags in `bookmark_tags` table
//
// RESPOND:
//   - Return the saved bookmark with a confirmation message
//
// This plugin demonstrates the full plugin lifecycle.
// Use it as a template when building new commands.
// ============================================

// ── Plugin Metadata ──────────────────────────
export const name = 'bookmark';
export const description = 'Save a URL with optional notes and tags';
export const syntax = '$bookmark https://example.com — great article about system design';

// ── Helpers ──────────────────────────────────

function generateId() {
  return 'bk_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function now() {
  return new Date().toISOString();
}

// ── Step 1: PARSE ────────────────────────────
// Extract the URL, note, and tags from the raw input.

export function parse(envelope) {
  let content = envelope.raw.trim();
  const tags = [];

  // Extract tags first (before we split on dashes)
  const tagMatches = content.match(/#(\w+)/g);
  if (tagMatches) {
    tagMatches.forEach(tag => {
      tags.push(tag.substring(1).toLowerCase());
    });
    content = content.replace(/#\w+/g, '');
  }

  // Extract URL — look for the first http:// or https:// pattern
  // This regex matches most common URLs
  const urlMatch = content.match(/(https?:\/\/[^\s]+)/i);
  const url = urlMatch ? urlMatch[1] : null;

  // Remove the URL from content to isolate the note
  if (url) {
    content = content.replace(url, '');
  }

  // Split on em dash (—) or double hyphen (--) to get the note
  // Everything after the separator is the note
  let note = '';
  const dashSplit = content.split(/\s*(?:—|--)\s*/);
  if (dashSplit.length > 1) {
    // Join everything after the first dash as the note
    note = dashSplit.slice(1).join(' — ').trim();
  } else {
    // No dash separator — whatever's left after the URL is the note
    note = content.trim();
  }

  // Clean up
  note = note.replace(/\s+/g, ' ').trim();

  return {
    url,
    note,
    tags,
    source: envelope.source || 'web',
    raw_input: envelope.raw
  };
}

// ── Step 2: PROCESS ──────────────────────────
// Write the bookmark to D1.

export async function process(parsed, env, ctx) {
  // Validate: we need at least a URL or a note
  if (!parsed.url && !parsed.note) {
    return {
      success: false,
      error: 'Bookmark needs a URL. Try: $bookmark https://example.com'
    };
  }

  const id = generateId();
  const timestamp = now();

  // Write to the bookmarks table
  await env.DB.prepare(`
    INSERT INTO bookmarks (id, url, title, note, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    parsed.url || '',
    null,  // title can be populated later (e.g., by fetching the page)
    parsed.note || null,
    parsed.source,
    timestamp,
    timestamp
  ).run();

  // Write tags
  if (parsed.tags.length > 0) {
    const tagInserts = parsed.tags.map(tag => {
      const tagId = 'btag_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      return env.DB.prepare(`
        INSERT INTO bookmark_tags (id, bookmark_id, tag) VALUES (?, ?, ?)
      `).bind(tagId, id, tag.toLowerCase());
    });
    await env.DB.batch(tagInserts);
  }

  const bookmark = {
    id,
    url: parsed.url || '',
    title: null,
    note: parsed.note || null,
    source: parsed.source,
    tags: parsed.tags,
    created_at: timestamp,
    updated_at: timestamp
  };

  return { success: true, item: bookmark };
}

// ── Step 3: RESPOND ──────────────────────────
// Format the response.

export function respond(result) {
  if (!result.success) {
    return {
      status: 400,
      body: { error: result.error, command: 'bookmark' }
    };
  }

  return {
    status: 201,
    body: {
      item: result.item,
      command: 'bookmark',
      message: 'Bookmark saved'
    }
  };
}
