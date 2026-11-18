/*
 * The contract between core and its plugins. A plugin imports no core runtime code:
 * everything it shares with core reaches it through `PluginApi`. A plugin that bundled
 * a stateful core module would run a second instance of it, splitting state such as
 * reactivity's active subscriber or the binder's registries, with no error.
 *
 * `PluginApi` is private. It stays out of `rouse.d.ts` and may change in any release,
 * so a plugin built for another version is refused before `install` runs. Making it
 * public is a separate decision: opening it later is non-breaking, closing it isn't.
 */
import type { RouseApp } from './app';
import { fail } from './core/diagnostics';

export type PluginName = 'sync' | 'sse';

/** Internals core shares with an installed plugin. */
export interface PluginApi {
  app: RouseApp;
}

/**
 * An optional feature, installed into one app through the `plugins` option of
 * `rouse()`. Load each plugin from the same release as the core library.
 */
export interface RousePlugin {
  readonly name: PluginName;
  readonly version: string;
  /** @internal */
  install(api: PluginApi): void;
}

/**
 * Validates the `plugins` option and drops repeated names. Throws on a version
 * mismatch, before anything is installed or the root is claimed.
 */
export function resolvePlugins(plugins: readonly RousePlugin[] = []): RousePlugin[] {
  const byName = new Map<PluginName, RousePlugin>();

  for (const plugin of plugins) {
    if (plugin.version !== __VERSION__) {
      fail(
        `Plugin '${plugin.name}' is version ${plugin.version}, but core is version ${__VERSION__}. Load both from the same release.`,
      );
    }
    if (!byName.has(plugin.name)) {
      byName.set(plugin.name, plugin);
    }
  }

  return [...byName.values()];
}

/** Installs each plugin into `app`. */
export function installPlugins(app: RouseApp, plugins: readonly RousePlugin[]): void {
  const api: PluginApi = { app };
  plugins.forEach((plugin) => plugin.install(api));
}
