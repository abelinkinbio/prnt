import { registry } from './registry.js';

function detectCommand(text) {
  const trimmed = text.trim();

  if (!trimmed.startsWith('$')) {
    return { command: null };
  }

  const match = trimmed.match(/^\$(\w+)/);
  if (!match) {
    return { command: null };
  }

  const commandName = match[1].toLowerCase();

  if (registry[commandName]) {
    return { command: commandName };
  }

  return { command: null };
}

export async function routeInput(raw, env) {
  const { command } = detectCommand(raw);

  const plugin = command
    ? registry[command]
    : registry.__default;

  if (!plugin) {
    throw new Error('No default plugin registered');
  }

  const parsed = plugin.parse(raw);
  const result = await plugin.process(parsed, env);
  const response = plugin.respond(result);

  return response;
}
