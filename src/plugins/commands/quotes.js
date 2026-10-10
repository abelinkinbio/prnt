// ============================================
// PRNT Plugin - $quotes
// ============================================
// Saves quotes with optional attribution and source.
//
// Syntax examples:
//   $quotes The obstacle is the way
//   $quotes The obstacle is the way - Marcus Aurelius
//   $quotes The obstacle is the way - Marcus Aurelius (Meditations)
//   $quotes "The obstacle is the way" - Marcus Aurelius
//
// The parser looks for:
//   1. Quote text (with or without surrounding quotes)
//   2. Attribution after " - " or " — "
//   3. Source in parentheses at the end
// ============================================

import { generateId, now } from '../../utils.js';

export const name = 'quotes';
export const description = 'Save quotes for daily inspiration';
export const syntax = '$quotes The obstacle is the way - Marcus Aurelius (Meditations)';

// Parse "$quotes text - attribution (source)" into structured data
export function parse(raw) {
  // Remove the "$quotes " prefix
  let text = raw.replace(/^\$quotes\s+/i, '').trim();

  // Extract source in parentheses at the end, e.g. "(Meditations)"
  let source = null;
  const sourceMatch = text.match(/\(([^)]+)\)\s*$/);
  if (sourceMatch) {
    source = sourceMatch[1].trim();
    text = text.substring(0, sourceMatch.index).trim();
  }

  // Split on " - " or " — " to separate quote from attribution
  let quoteText = text;
  let attribution = null;

  // Try em dash first, then regular dash
  const dashSplit = text.split(/\s[—]\s/);
  if (dashSplit.length > 1) {
    quoteText = dashSplit[0].trim();
    attribution = dashSplit.slice(1).join(' — ').trim();
  } else {
    // Try regular dash (but only " - " with spaces to avoid
    // matching hyphens inside words like "self-discipline")
    const hyphenSplit = text.split(/\s-\s/);
    if (hyphenSplit.length > 1) {
      quoteText = hyphenSplit[0].trim();
      attribution = hyphenSplit.slice(1).join(' - ').trim();
    }
  }

  // Remove surrounding quote marks if present
  quoteText = quoteText.replace(/^[""\u201C]+|[""\u201D]+$/g, '').trim();

  return {
    quote_text: quoteText,
    attribution,
    source,
    raw_input: raw
  };
}

// Save the quote to D1
export async function process(parsed, env) {
  if (!parsed.quote_text || !parsed.quote_text.trim()) {
    const error = new Error('quote_text is required');
    error.status = 400;
    throw error;
  }

  const id = generateId('quote');
  const timestamp = now();

  await env.DB.prepare(`
    INSERT INTO quotes (id, quote_text, attribution, source, favorite, ai_attributed, source_input, raw_input, created_at, updated_at, deleted)
    VALUES (?, ?, ?, ?, 0, 0, 'command', ?, ?, ?, 0)
  `).bind(
    id,
    parsed.quote_text,
    parsed.attribution,
    parsed.source,
    parsed.raw_input,
    timestamp,
    timestamp
  ).run();

  return {
    id,
    quote_text: parsed.quote_text,
    attribution: parsed.attribution,
    source: parsed.source,
    created_at: timestamp
  };
}

// Format the response
export function respond(result) {
  return {
    command: 'quotes',
    message: 'Quote saved',
    item: result
  };
}
