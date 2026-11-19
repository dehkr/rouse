/*
 * The contract between core and its plugins. A plugin imports no core runtime code
 * beyond stateless helpers: everything it shares with core reaches it through
 * `PluginApi`. A plugin that bundled a stateful core module would run a second
 * instance of it, splitting state such as reactivity's active subscriber or the
 * binder's registries, with no error.
 *
 * `PluginApi` is private. It stays out of `rouse.d.ts` and may change in any release,
 * so a plugin built for another version is refused before `install` runs. Making it
 * public is a separate decision: opening it later is non-breaking, closing it isn't.
 *
 * `core` is one object shared by every app, so a plugin may keep it in module state.
 * Anything per app, such as the app's own tables, is reached through `app`.
 */
import type { RouseApp } from './app';
import { fail } from './core/diagnostics';
import { hasPlugin, needsPlugin, type PluginName } from './core/plugins';
import { defineNetworkOpDirective } from './directives/define-network-op';
import { parseTriggers } from './core/parser';
import { dispatchTrigger } from './dom/events';
import { resolveListenerTarget } from './dom/modifiers';
import { resolveUrl } from './net/payload';

export type { PluginName };

/** Core functions a plugin uses. The same object for every app. */
export interface CoreApi {
  defineNetworkOpDirective: typeof defineNetworkOpDirective;
  dispatchTrigger: typeof dispatchTrigger;
  parseTriggers: typeof parseTriggers;
  resolveListenerTarget: typeof resolveListenerTarget;
  resolveUrl: typeof resolveUrl;
}

/** What core passes to `install`: the app being created, and core's shared functions. */
export interface PluginApi {
  app: RouseApp;
  core: CoreApi;
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

const core: CoreApi = {
  defineNetworkOpDirective,
  dispatchTrigger,
  parseTriggers,
  resolveListenerTarget,
  resolveUrl,
};

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

/**
 * Installs each plugin into `app`. In the dev build, a method a missing plugin would
 * add throws an install hint instead of a bare "is not a function".
 */
export function installPlugins(app: RouseApp, plugins: readonly RousePlugin[]): void {
  if (__DEV__ && !hasPlugin(app, 'sse')) {
    (app as any).sse = () => fail(`app.sse() ${needsPlugin('sse')}`);
  }

  plugins.forEach((plugin) => plugin.install({ app, core }));
}
