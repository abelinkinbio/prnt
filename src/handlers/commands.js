import { jsonResponse } from '../utils.js';
import { registry } from '../plugins/registry.js';

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
