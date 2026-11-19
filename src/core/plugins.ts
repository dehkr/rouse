/*
 * Which plugin owns each name that markup or `app.on` can use, so core can tell a known
 * name whose plugin isn't installed from an unknown one. Core keeps the plugins' slugs
 * in `DIRECTIVE_SLUGS` for the same reason. The tables back diagnostics only, so every
 * lookup sits behind `__DEV__`.
 */
import type { RouseApp } from '../app';
import type { DirectiveSlug } from './constants';

export type PluginName = 'sync' | 'sse';

/** Directives a plugin owns. `rz-close` is left out: it's inert without `rz-sse`. */
export const PLUGIN_DIRECTIVES = new Map<DirectiveSlug, PluginName>([['sse', 'sse']]);

/** Trigger sources a plugin owns. */
export const PLUGIN_TRIGGERS = new Map<string, PluginName>([['sse', 'sse']]);

export function hasPlugin(app: RouseApp, name: PluginName): boolean {
  return app.config.plugins.some((plugin) => plugin.name === name);
}

/** Ends a missing-plugin diagnostic: "rz-sse: needs " + `needsPlugin('sse')`. */
export function needsPlugin(name: PluginName): string {
  return `needs the ${name} plugin. Install it with rouse({ plugins: [${name}] }).`;
}
