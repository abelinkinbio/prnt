// ============================================
// PRNT - Commands Handler
// ============================================
// Returns the list of available $commands.
// The frontend calls GET /api/commands when you
// type "$" in the input terminal, so it knows
// what autocomplete suggestions to show.
//
// The plugin registry is the only source of
// truth (the same object the router dispatches
// from). __default is the fallback task/note
// handler, not a $command, so it is skipped.
// ============================================

import { jsonResponse } from '../utils.js';
import { registry } from '../plugins/registry.js';

// GET /api/commands — list real $commands from the registry
export function handleCommandsList() {
  const commands = Object.entries(registry)
    .filter(([key]) => key !== '__default')
    .map(([, plugin]) => ({
      name: plugin.name,
      description: plugin.description,
      syntax: plugin.syntax
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return jsonResponse({ commands });
}
