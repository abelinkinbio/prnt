import { generateId, now } from '../../utils.js';

export const name = 'bookmark';
export const description = 'Save a URL with optional notes and tags';
export const syntax = '$bookmark https://example.com — description #tag';

// Parse "$bookmark URL — note #tags" into structured data
export function parse(raw) {
  // Remove the "$bookmark " prefix
  let text = raw.replace(/^\$bookmark\s+/i, '').trim();

  // Extract tags first (so they don't interfere with URL/note parsing)
  const tags = [];
  const tagMatches = text.match(/#(\w+)/g);
  if (tagMatches) {
    tagMatches.forEach(tag => tags.push(tag.substring(1).toLowerCase()));
    text = text.replace(/#\w+/g, '').trim();
  }

  // Split on " — " (em dash) or " - " (space-hyphen-space)
  // Everything before is the URL, everything after is the note
  let url = text;
  let note = null;

  const dashSplit = text.split(/\s[—\-]\s/);
  if (dashSplit.length > 1) {
    url = dashSplit[0].trim();
    note = dashSplit.slice(1).join(' — ').trim();
  }

  // Clean up the URL (remove trailing whitespace/punctuation)
  url = url.trim().replace(/[,.\s]+$/, '');

  return {
    url,
    note,
    tags,
    raw_input: raw
  };
}

// Save the bookmark to D1
export async function process(parsed, env) {
  const id = generateId('bm');
  const timestamp = now();

  // Insert the bookmark
  await env.DB.prepare(`
    INSERT INTO bookmarks (id, url, title, note, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'web', ?, ?)
  `).bind(
    id,
    parsed.url,
    null, // title — could be fetched later
    parsed.note,
    timestamp,
    timestamp
  ).run();

  // Insert tags
  if (parsed.tags.length > 0) {
    const tagInserts = parsed.tags.map(tag => {
      const tagId = generateId('btag');
      return env.DB.prepare(
        `INSERT INTO bookmark_tags (id, bookmark_id, tag) VALUES (?, ?, ?)`
      ).bind(tagId, id, tag.toLowerCase());
    });
    await env.DB.batch(tagInserts);
  }

  return {
    id,
    url: parsed.url,
    note: parsed.note,
    tags: parsed.tags,
    created_at: timestamp
  };
}

// Format the response
export function respond(result) {
  return {
    command: 'bookmark',
    message: 'Bookmark saved',
    item: result
  };
}
