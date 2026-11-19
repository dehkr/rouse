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
import type { SyncMethod } from './plugins/sync';
import { fail } from './core/diagnostics';
import { hasPlugin, needsPlugin, type PluginName } from './core/plugins';
import { defineNetworkOpDirective } from './directives/define-network-op';
import { parseStoreRef, parseTriggers, safeJSONParse } from './core/parser';
import { getNestedVal, getPathRoot, setNestedVal } from './core/path';
import { clone, hasAccessor, isPlainObject, patchState } from './core/state';
import { dispatchTrigger } from './dom/events';
import { resolveListenerTarget } from './dom/modifiers';
import { runRequestLifecycle } from './net/lifecycle';
import { resolveUrl } from './net/payload';
import { request } from './net/request';
import { fallbackResponse } from './net/response';
import { batch, reactive } from './reactivity/reactive';

export type { PluginName };

/** Core functions a plugin uses. The same object for every app. */
export interface CoreApi {
  batch: typeof batch;
  clone: typeof clone;
  defineNetworkOpDirective: typeof defineNetworkOpDirective;
  dispatchTrigger: typeof dispatchTrigger;
  fallbackResponse: typeof fallbackResponse;
  getNestedVal: typeof getNestedVal;
  getPathRoot: typeof getPathRoot;
  hasAccessor: typeof hasAccessor;
  isPlainObject: typeof isPlainObject;
  parseStoreRef: typeof parseStoreRef;
  parseTriggers: typeof parseTriggers;
  patchState: typeof patchState;
  reactive: typeof reactive;
  request: typeof request;
  resolveListenerTarget: typeof resolveListenerTarget;
  resolveUrl: typeof resolveUrl;
  runRequestLifecycle: typeof runRequestLifecycle;
  safeJSONParse: typeof safeJSONParse;
  setNestedVal: typeof setNestedVal;
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

// The methods the sync plugin adds to `app.stores`, stubbed in the dev build without
// it. A record, so the compiler requires every method and no others.
const SYNC_METHODS: Record<SyncMethod, true> = {
  baseline: true,
  status: true,
  isDirty: true,
  dirtyRoots: true,
  config: true,
  push: true,
  pull: true,
  reset: true,
  revert: true,
  commit: true,
};

const core: CoreApi = {
  batch,
  clone,
  defineNetworkOpDirective,
  dispatchTrigger,
  fallbackResponse,
  getNestedVal,
  getPathRoot,
  hasAccessor,
  isPlainObject,
  parseStoreRef,
  parseTriggers,
  patchState,
  reactive,
  request,
  resolveListenerTarget,
  resolveUrl,
  runRequestLifecycle,
  safeJSONParse,
  setNestedVal,
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
  if (__DEV__ && !hasPlugin(app, 'sync')) {
    Object.keys(SYNC_METHODS).forEach((method) => {
      (app.stores as any)[method] = () =>
        fail(`app.stores.${method}() ${needsPlugin('sync')}`);
    });
  }

  plugins.forEach((plugin) => plugin.install({ app, core }));
}
