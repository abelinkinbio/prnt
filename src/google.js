export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks'
].join(' ');

export function getAuthUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code, clientId, clientSecret, redirectUri) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  return response.json();
}

export async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }
  return response.json();
}

export async function getValidAccessToken(env) {
  const auth = await env.DB.prepare(
    `SELECT * FROM google_auth WHERE id = 'default'`
  ).first();

  if (!auth) return null;

  const now = new Date();
  const expiry = new Date(auth.token_expiry);

  // Refresh if token expires in less than 5 minutes
  if (expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
    try {
      const tokens = await refreshAccessToken(
        auth.refresh_token,
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET
      );
      const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      await env.DB.prepare(`
        UPDATE google_auth 
        SET access_token = ?, token_expiry = ?, updated_at = ?
        WHERE id = 'default'
      `).bind(tokens.access_token, newExpiry, new Date().toISOString()).run();

      return tokens.access_token;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  return auth.access_token;
}

export async function createCalendarReminder(accessToken, task) {
  if (!task.due_date) return null;

  const dueDateTime = task.due_time
    ? `${task.due_date}T${task.due_time}:00`
    : `${task.due_date}T18:00:00`;

  const event = {
    summary: `📋 ${task.content}`,
    description: `PRNT Task\nPriority: P${task.priority ?? '-'}\nTags: ${(task.tags || []).map(t => '#' + t).join(' ') || 'none'}`,
    start: { dateTime: dueDateTime, timeZone: 'Europe/Lisbon' },
    end: { dateTime: dueDateTime, timeZone: 'Europe/Lisbon' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 24 * 60 },
        { method: 'popup', minutes: 0 }
      ]
    },
    visibility: 'private',
    transparency: 'transparent'
  };

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Calendar API error: ${error}`);
  }

  const createdEvent = await response.json();
  return createdEvent.id;
}

export async function updateCalendarEvent(accessToken, eventId, task) {
  if (!task.due_date) {
    await deleteCalendarEvent(accessToken, eventId);
    return null;
  }

  const dueDateTime = task.due_time
    ? `${task.due_date}T${task.due_time}:00`
    : `${task.due_date}T18:00:00`;

  const event = {
    summary: task.completed ? `✅ ${task.content}` : `📋 ${task.content}`,
    description: `PRNT Task\nPriority: P${task.priority ?? '-'}\nTags: ${(task.tags || []).map(t => '#' + t).join(' ') || 'none'}`,
    start: { dateTime: dueDateTime, timeZone: 'Europe/Lisbon' },
    end: { dateTime: dueDateTime, timeZone: 'Europe/Lisbon' },
    visibility: 'private',
    transparency: 'transparent'
  };

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Calendar update error: ${error}`);
  }
  return eventId;
}

export async function deleteCalendarEvent(accessToken, eventId) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Calendar delete error: ${error}`);
  }
}

async function getOrCreateTaskList(accessToken, listName) {
  const listResponse = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!listResponse.ok) throw new Error('Failed to fetch task lists');

  const lists = await listResponse.json();
  const existingList = (lists.items || []).find(l => l.title === listName);

  if (existingList) return existingList.id;

  const createResponse = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: listName })
  });
  if (!createResponse.ok) throw new Error('Failed to create task list');

  const newList = await createResponse.json();
  return newList.id;
}

export async function createGoogleTask(accessToken, task) {
  const taskListId = await getOrCreateTaskList(accessToken, 'PRNT');

  const googleTask = {
    title: task.content,
    notes: `Priority: P${task.priority ?? '-'}\nTags: ${(task.tags || []).map(t => '#' + t).join(' ') || 'none'}`,
    status: task.completed ? 'completed' : 'needsAction'
  };
  if (task.due_date) googleTask.due = `${task.due_date}T00:00:00.000Z`;

  const response = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(googleTask)
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tasks API error: ${error}`);
  }

  const created = await response.json();
  return created.id;
}

export async function updateGoogleTask(accessToken, taskId, task) {
  const taskListId = await getOrCreateTaskList(accessToken, 'PRNT');

  const googleTask = {
    title: task.content,
    notes: `Priority: P${task.priority ?? '-'}\nTags: ${(task.tags || []).map(t => '#' + t).join(' ') || 'none'}`,
    status: task.completed ? 'completed' : 'needsAction'
  };
  if (task.due_date) googleTask.due = `${task.due_date}T00:00:00.000Z`;

  const response = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(googleTask)
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tasks update error: ${error}`);
  }
  return taskId;
}

export async function deleteGoogleTask(accessToken, taskId) {
  const taskListId = await getOrCreateTaskList(accessToken, 'PRNT');

  const response = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Tasks delete error: ${error}`);
  }
}

// Callers must schedule this with ctx.waitUntil(...).
export async function syncToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return;

    let calendarEventId = null;
    let googleTaskId = null;

    if (item.type === 'task' && item.due_date) {
      try { calendarEventId = await createCalendarReminder(accessToken, item); }
      catch (e) { console.error('Calendar sync error:', e); }
    }

    if (item.type === 'task') {
      try { googleTaskId = await createGoogleTask(accessToken, item); }
      catch (e) { console.error('Tasks sync error:', e); }
    }

    if (calendarEventId || googleTaskId) {
      await env.DB.prepare(`
        UPDATE items SET google_calendar_event_id = ?, google_task_id = ? WHERE id = ?
      `).bind(calendarEventId, googleTaskId, item.id).run();
    }
  } catch (error) {
    console.error('Google sync error:', error);
  }
}
