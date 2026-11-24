import type { RousePlugin, StoreManager } from 'rousejs';
import { SYNC_METHODS, type SyncMethod } from '../../core/constants';
import { setCore } from '../core';
import { rzPull, rzPush } from './directives';
import { StoreSync } from './manager';
import type { StoreStatus, SyncPolicy, SyncRequest } from './types';

export type { StoreStatus, SyncPolicy, SyncRequest };

declare module 'rousejs' {
  // Adds the sync options to `app.store()`
  interface StoreOptions extends Partial<SyncPolicy> {}

  interface StoreManager {
    /**
     * Returns a copy of the last synced state: what a push or pull last confirmed,
     * or what `commit()`, `update()`, or `deposit()` last asserted. This is the
     * reference point for unsaved changes and what `revert()` restores. Non-reactive,
     * like `snapshot()`.
     *
     * Requires the `sync` plugin.
     */
    baseline<T = any>(storeName: string | null | undefined): T | undefined;
    /**
     * Returns the status object for a store, or `undefined`. Available store
     * status properties are `syncing`, `error`, `lastSync`, `dirty`, and `dirtyRoots`.
     *
     * Requires the `sync` plugin.
     */
    status(storeName: string | null | undefined): StoreStatus | undefined;
    /**
     * Returns `true` when the store has unsaved changes. Pass a root key to ask
     * about that key alone, the same question `@name::status.dirtyRoots.key` answers
     * in HTML.
     *
     * The answer comes from the store's status, which updates a microtask after an
     * edit.
     *
     * Requires the `sync` plugin.
     */
    isDirty(storeName: string | null | undefined, root?: string): boolean;
    /**
     * Patches `SyncPolicy` for a store. Warns if the store is missing.
     *
     * Requires the `sync` plugin.
     */
    config(storeName: string | null | undefined, config: Partial<SyncPolicy>): void;
    /**
     * Sends the store's data to the server.
     *
     * If the store already has a request in flight, the push waits for it, and once that
     * request succeeds, it's sent if the data still differs from what the server holds.
     * The promise resolves when the push's request finishes or, if it had to wait, once
     * the store has nothing in flight and nothing left to send. It never rejects: read
     * `status(name).error` to see whether a push failed.
     *
     * Options apply to this push only and take precedence over the store's own config,
     * for example `push('user', { indicator: '#save', timeout: 5000 })`. A push is
     * always a `PATCH` carrying the whole store, so there is no `method` or `body`.
     *
     * Requires the `sync` plugin.
     */
    push(storeName: string | null | undefined, options?: SyncRequest): Promise<void>;
    /**
     * Pulls fresh store data from the server, unless a push is currently in flight.
     *
     * Options apply to this pull only and take precedence over the store's own config.
     * Pass `url` to pull from somewhere other than the store's endpoint:
     * `pull('user', { url: '/api/user?fields=name' })`.
     *
     * Requires the `sync` plugin.
     */
    pull(storeName: string | null | undefined, options?: SyncRequest): Promise<void>;
    /**
     * Discards unsaved changes, restoring the store to the last synced state, which
     * `baseline()` returns. Pass a dot path to revert a single field or branch
     * instead of the whole store. Returns `true` if anything changed.
     *
     * Requires the `sync` plugin.
     */
    revert(storeName: string | null | undefined, path?: string): boolean;
    /**
     * Marks the store's current data as the new baseline, so nothing reads as dirty.
     * Does not send anything to the server. Use it when state reached the server by
     * some means Rouse did not perform, such as a native form submit or a socket
     * acknowledgement.
     *
     * Requires the `sync` plugin.
     */
    commit(storeName: string | null | undefined): void;
  }
}

const METHODS = SYNC_METHODS satisfies readonly (keyof StoreSync & keyof StoreManager)[];

/**
 * Syncs stores with a server endpoint: `rz-push`, `rz-pull`, `@store::status`, the
 * store `url` and request options, and the sync methods on `app.stores`. Install with
 * `rouse({ plugins: [sync] })`.
 */
export const sync: RousePlugin = {
  name: 'sync',
  version: __VERSION__,
  install({ app, core }) {
    setCore(core);

    const stores = app.stores;
    const storeSync = new StoreSync(app);

    stores._hooks = storeSync.hooks();
    stores._namespaces.set('status', (storeName) => storeSync.status(storeName));
    METHODS.forEach((method) => {
      (stores as Record<SyncMethod, unknown>)[method] = storeSync[method].bind(storeSync);
    });

    app._addStandaloneDirective(rzPush);
    app._addStandaloneDirective(rzPull);
  },
};
