// ============================================
// PRNT — $bookmark Plugin
// Save a URL with optional notes and tags.
//
// FORMAT:
//   $bookmark https://example.com — great article #design #reading
//   $bookmark https://example.com
//   $bookmark example.com quick note about this site
//
// PARSE RULES:
//   1. First URL-shaped string becomes the URL
//   2. Text after " — " (em dash with spaces) is the note
//   3. If no em dash, text after the URL is the note
//   4. #tags are extracted from anywhere in the text
//
// This plugin stores bookmarks in their own table,
// separate from items. Each plugin owns its own
// data — that's the pattern.
//
// ARCHITECTURE:
// This is the proof that the plugin system works.
// If adding $bookmark felt clean and obvious, the
// foundation is solid. If it felt hacky, something
// was wrong with the router/registry design.
// ============================================

// ─── Plugin Metadata ───
export const name = 'bookmark';
export const description = 'Save a URL with optional notes and tags';

// ─── Helpers ───

function generateId() {
  return 'bm_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function now() {
  return new Date().toISOString();
}

// ─── 1. PARSE ───
// Extract the URL, note, and tags from raw input.
//
// The envelope.raw has already had "$bookmark " stripped
// by the router, so we're working with just the content.

export function parse(envelope) {
  let raw = envelope.raw.trim();
  const tags = [];

  // Extract #tags first (before URL parsing, so tags
  // adjacent to URLs don't confuse the URL regex)
  const tagMatches = raw.match(/#(\w+)/g);
  if (tagMatches) {
    tagMatches.forEach(tag => {
      tags.push(tag.substring(1).toLowerCase());
    });
    raw = raw.replace(/#\w+/g, '');
  }

  // Extract URL
  // Match common URL patterns: https://, http://, or bare domain
  const urlMatch = raw.match(/(https?:\/\/[^\s]+|(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}[^\s]*)/i);
  let url = null;
  let note = '';

  if (urlMatch) {
    url = urlMatch[1];

    // Add https:// if no protocol was provided
    if (!url.match(/^https?:\/\//)) {
      url = 'https://' + url;
    }

    // Remove the URL from the text to isolate the note
    let remaining = raw.replace(urlMatch[0], '').trim();

    // Check for " — " separator (em dash style)
    if (remaining.includes(' — ')) {
      note = remaining.split(' — ').filter(s => s.trim()).join(' — ').trim();
    } else if (remaining.includes(' - ')) {
      // Also accept plain dash as separator
      const parts = remaining.split(' - ');
      note = parts.filter(s => s.trim()).join(' - ').trim();
    } else {
      // Everything remaining is the note
      note = remaining;
    }
  } else {
    // No URL found — treat everything as the note
    // (This handles the edge case where someone types
    // "$bookmark some idea about a site" without a URL)
    note = raw.trim();
  }

  // Clean up whitespace
  note = note.replace(/\s+/g, ' ').trim();

  return {
    url,
    note: note || null,
    tags,
    source: envelope.source || 'web'
  };
}

// ─── 2. PROCESS ───
// Write the bookmark to D1.

export async function process(parsed, env, ctx) {
  if (!parsed.url) {
    return {
      success: false,
      error: 'No URL found. Usage: $bookmark https://example.com — optional note'
    };
  }

  const id = generateId();
  const timestamp = now();

  // Insert bookmark
  await env.DB.prepare(`
    INSERT INTO bookmarks (id, url, title, note, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    parsed.url,
    null,          // title — could be auto-fetched later
    parsed.note,
    parsed.source,
    timestamp,
    timestamp
  ).run();

  // Insert tags
  if (parsed.tags.length > 0) {
    const tagInserts = parsed.tags.map(tag => {
      const tagId = 'bmtag_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      return env.DB.prepare(`
        INSERT INTO bookmark_tags (id, bookmark_id, tag) VALUES (?, ?, ?)
      `).bind(tagId, id, tag);
    });
    await env.DB.batch(tagInserts);
  }

  const newBookmark = {
    id,
    url: parsed.url,
    title: null,
    note: parsed.note,
    source: parsed.source,
    tags: parsed.tags,
    created_at: timestamp,
    updated_at: timestamp
  };

  return { success: true, item: newBookmark };
}

// ─── 3. RESPOND ───
// Format the response.

export function respond(result) {
  if (!result.success) {
    return {
      command: 'bookmark',
      message: result.error,
      error: true
    };
  }

  return {
    command: 'bookmark',
    message: 'Bookmark saved',
    item: result.item
  };
}
