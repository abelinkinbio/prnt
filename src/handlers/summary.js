// ============================================
// PRNT — AI Summary Handler
// ============================================
// Replaces: functions/api/summary.js
// Route:    POST /api/summary

import { jsonResponse } from '../utils.js';

export async function handleSummary(env) {
  try {
    // Get items from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();

    const recentItems = await env.DB.prepare(`
      SELECT * FROM items 
      WHERE created_at >= ? OR updated_at >= ?
      ORDER BY created_at DESC
    `).bind(sevenDaysAgoStr, sevenDaysAgoStr).all();

    // Get tags for recent items
    const itemIds = recentItems.results.map(i => i.id);
    let tagsByItem = {};

    if (itemIds.length > 0) {
      const tagsResult = await env.DB.prepare(
        `SELECT item_id, tag FROM tags WHERE item_id IN (${itemIds.map(() => '?').join(',')})`
      ).bind(...itemIds).all();

      for (const row of tagsResult.results) {
        if (!tagsByItem[row.item_id]) tagsByItem[row.item_id] = [];
        tagsByItem[row.item_id].push(row.tag);
      }
    }

    // Calculate stats
    const tasks = recentItems.results.filter(i => i.type === 'task');
    const notes = recentItems.results.filter(i => i.type === 'note');
    const completedTasks = tasks.filter(t => t.completed === 1);
    const p0Tasks = tasks.filter(t => t.priority === 0);
    const p1Tasks = tasks.filter(t => t.priority === 1);
    const overdueTasks = tasks.filter(t => {
      if (!t.due_date || t.completed) return false;
      return new Date(t.due_date) < new Date();
    });

    const allTags = new Set();
    for (const tags of Object.values(tagsByItem)) {
      tags.forEach(t => allTags.add(t));
    }

    // If no Anthropic API key, return basic summary
    if (!env.ANTHROPIC_API_KEY) {
      const completionRate = tasks.length > 0
        ? Math.round((completedTasks.length / tasks.length) * 100)
        : 0;

      return jsonResponse({
        summary: `This week: ${tasks.length} tasks created, ${completedTasks.length} completed (${completionRate}% completion rate). ${p0Tasks.length} urgent tasks, ${overdueTasks.length} overdue. Most used tags: ${Array.from(allTags).slice(0, 5).join(', ') || 'none'}.`,
        generated_at: new Date().toISOString(),
        ai_powered: false
      });
    }

    // Build context for Claude
    const taskSummaries = tasks.slice(0, 20).map(t => ({
      content: t.content,
      priority: t.priority,
      completed: t.completed === 1,
      due_date: t.due_date,
      tags: tagsByItem[t.id] || []
    }));

    const prompt = `You are a productivity coach analyzing someone's weekly task data. Be encouraging but honest.

Here's the data from the past week:
- Tasks created: ${tasks.length}
- Tasks completed: ${completedTasks.length}
- P0 (urgent+important) tasks: ${p0Tasks.length}
- P1 (important) tasks: ${p1Tasks.length}
- Overdue tasks: ${overdueTasks.length}
- Notes created: ${notes.length}
- Tags used: ${Array.from(allTags).join(', ') || 'none'}

Recent tasks (up to 20):
${JSON.stringify(taskSummaries, null, 2)}

Write a 2-3 sentence personalized weekly summary that:
1. Highlights accomplishments
2. Notes any concerning patterns (like many overdue tasks)
3. Gives one actionable suggestion for next week

Keep it concise and motivating. Don't use bullet points.`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!aiResponse.ok) throw new Error('AI API request failed');

    const aiData = await aiResponse.json();

    return jsonResponse({
      summary: aiData.content[0].text,
      generated_at: new Date().toISOString(),
      ai_powered: true,
      stats: {
        tasks_created: tasks.length,
        tasks_completed: completedTasks.length,
        completion_rate: tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
        overdue: overdueTasks.length,
        tags: Array.from(allTags)
      }
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    return jsonResponse({
      error: 'Failed to generate summary',
      summary: 'Unable to generate AI summary at this time. Please try again later.'
    }, 500);
  }
}
