// ---- Response Helpers ----

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Content-Type': 'application/json'
  };
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders()
  });
}

export function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html' }
  });
}

// ---- ID Generation ----

export function generateId(prefix = 'item') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ---- Timestamp ----

export function now() {
  return new Date().toISOString();
}

// ---- Date Formatting ----

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// ---- Shorthand Parser ----
// Parses text like "Review PR @today p0 #frontend" into
// structured data. Same logic as your old ingest.js parser.

export function parseShorthand(raw) {
  let content = raw.trim();
  let type = 'note';
  let priority = null;
  let dueDate = null;
  let dueTime = null;
  const tags = [];

  // /t command forces item to be a task
  if (content.includes('/t')) {
    type = 'task';
    content = content.replace(/\/t\s*/g, '');
  }

  // Priority: p0, p1, p2, p3
  const priorityMatch = content.match(/\bp([0-3])\b/i);
  if (priorityMatch) {
    priority = parseInt(priorityMatch[1]);
    content = content.replace(/\bp[0-3]\b/gi, '');
  }

  // Tags: #frontend, #work, etc.
  const tagMatches = content.match(/#(\w+)/g);
  if (tagMatches) {
    tagMatches.forEach(tag => tags.push(tag.substring(1).toLowerCase()));
    content = content.replace(/#\w+/g, '');
  }

  // Get current date in Lisbon timezone for relative dates
  const nowDate = new Date();
  const lisbon = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = lisbon.formatToParts(nowDate);
  const lisbonDate = new Date(
    parseInt(parts.find(p => p.type === 'year').value),
    parseInt(parts.find(p => p.type === 'month').value) - 1,
    parseInt(parts.find(p => p.type === 'day').value)
  );

  // @today
  if (content.match(/@today\b/i)) {
    dueDate = formatDate(lisbonDate);
    content = content.replace(/@today\b/gi, '');
    type = 'task';
  }

  // @eod (end of day — 6pm Lisbon)
  if (content.match(/@eod\b/i)) {
    dueDate = formatDate(lisbonDate);
    dueTime = '18:00';
    content = content.replace(/@eod\b/gi, '');
    type = 'task';
  }

  // @tomorrow or @tmrw
  if (content.match(/@(tomorrow|tmrw)\b/i)) {
    const tomorrow = new Date(lisbonDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueDate = formatDate(tomorrow);
    content = content.replace(/@(tomorrow|tmrw)\b/gi, '');
    type = 'task';
  }

  // @friday or @eow (end of week)
  if (content.match(/@(friday|eow)\b/i)) {
    const friday = new Date(lisbonDate);
    const daysUntilFriday = (5 - friday.getDay() + 7) % 7 || 7;
    friday.setDate(friday.getDate() + daysUntilFriday);
    dueDate = formatDate(friday);
    content = content.replace(/@(friday|eow)\b/gi, '');
    type = 'task';
  }

  // @jan-25 style specific dates
  const dateMatch = content.match(/@([a-z]{3})-(\d{1,2})\b/i);
  if (dateMatch) {
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = months[dateMatch[1].toLowerCase()];
    const day = parseInt(dateMatch[2]);
    if (month !== undefined && day >= 1 && day <= 31) {
      const targetDate = new Date(lisbonDate.getFullYear(), month, day);
      if (targetDate < lisbonDate) targetDate.setFullYear(targetDate.getFullYear() + 1);
      dueDate = formatDate(targetDate);
      content = content.replace(/@[a-z]{3}-\d{1,2}\b/gi, '');
      type = 'task';
    }
  }

  // Clean up extra whitespace
  content = content.replace(/\s+/g, ' ').trim();

  return { content, raw_input: raw, type, priority, due_date: dueDate, due_time: dueTime, tags };
}
