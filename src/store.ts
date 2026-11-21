/*
 * Core stores: the registry, `update()`, `deposit()`, `persist`, and the edit tracking
 * behind the `edit` trigger. Sync (baselines, dirty status, push and pull) is the sync
 * plugin's, reached only through `_hooks`. Don't read or write sync state here.
 *
 * Every framework write goes through `_frameworkWrite`, which keeps it out of `edit` and
 * calls exactly one hook: `reseeded`, `deposited`, or `patched`. A second hook for the
 * same write would make sync recompute the dirty status twice. Every
 * `rz:store:patch:*` dispatch goes through `_dispatchPatchEvent`.
 */
import {
  type PersistOptions,
  resolvePersist,
  restore,
  startSaving,
} from './reactivity/persist';
import { batch, reactive, trackDirty, untracked } from './reactivity/reactive';
import type { LifecycleEventMap, RouseResponse, StorePatchEvent, VoidFn } from './types';
import type { RouseApp } from './app';
import { fail, warn } from './core/diagnostics';
import { needsPlugin } from './core/plugins';
import { dispatchFrom } from './core/dispatch';
import { clone, nullPaths, patchState } from './core/state';

/** Receives the store roots that changed in one batch of user edits. */
export type EditListener = (roots: ReadonlySet<string>) => void;

/**
 * Options a plugin adds to `app.store()`. Empty without one, so an option that needs a
 * plugin, such as the sync plugin's `url`, is a type error until that plugin is
 * installed.
 */
export interface StoreOptions {}

/** The sync config a `<script data-rz-store>` declares. Only the sync plugin reads it. */
export interface DeclaredSync {
  url?: string;
  headers?: Record<string, string | null>;
}

/** @internal */
export interface StoreEntry {
  name: string;
  data: any;
  /**
   * The `<script data-rz-store>` the store was declared on. Kept after the script is
   * removed, so a same-name replacement can be told apart from a duplicate.
   */
  el?: Element;
  listeners?: Set<EditListener>;
  touched?: Set<string>;
  /** Stops saving to Web Storage. Set only on a store created with `persist`. */
  stopSaving?: VoidFn;
}

/**
 * Points in a store's lifecycle where a plugin extends core. Core calls each hook that
 * is set, and otherwise does nothing.
 *
 * @internal
 */
export interface StoreHooks {
  /**
   * A store is about to register. `declared` is its state before `persist` restored a
   * saved copy, and `policy` is unset when no config was passed. Throwing rejects it.
   */
  created(
    entry: StoreEntry,
    declared: object,
    policy: StoreOptions | undefined,
    persisted: boolean,
  ): void;
  /** A `<script data-rz-store>` re-declared the store, with the policy it declares. */
  redeclared(entry: StoreEntry, policy: DeclaredSync): void;
  /** The store's data was replaced whole, by `update()` or a re-declared script. */
  reseeded(entry: StoreEntry): void;
  /**
   * Any other framework write landed, changing `roots`, or any root when unset.
   * Not called for a reseed or a deposit, which have their own hooks.
   */
  patched(entry: StoreEntry, roots?: Iterable<string>): void;
  /** A deposit merged `payload` into the data. Runs inside the deposit's batch. */
  deposited(entry: StoreEntry, payload: object): void;
  /** A batch of user edits touched `roots`. Runs before the edit listeners. */
  edited(entry: StoreEntry, roots: ReadonlySet<string>): void;
  /** The store was removed. */
  removed(entry: StoreEntry): void;
}

/**
 * Warns for each sync option passed to a store in an app without the sync plugin,
 * where nothing reads them. Dev-only; gate every call with `__DEV__`.
 */
function warnSyncOptions(storeName: string, policy: object) {
  Object.keys(policy).forEach((key) =>
    warn(`Store '${storeName}': '${key}' ${needsPlugin('sync')}`),
  );
}

/**
 * Throws unless `state` is an object. It can't be an array. A root array's own
 * mutations never mark it dirty, and sync would merge it index by index.
 */
function assertStoreState(storeName: string, state: unknown) {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    fail(
      `Store '${storeName}' must be an object, not ${Array.isArray(state) ? 'an array' : String(state)}.`,
    );
  }
}

/**
 * Warns for each object property holding `null` in a baseline the caller is
 * asserting. Dev-only; gate every call with `__DEV__`.
 */
function warnNullFields(storeName: string, state: object) {
  nullPaths(state).forEach((path) =>
    warn(
      `Store '${storeName}': '${path}' is null. Sync reads null as a delete (RFC 7396), so it cannot rest as a value. Use '' or omit the key.`,
    ),
  );
}

/**
 * Manages one app's stores by name, as `app.stores`. Each app has its own, so stores
 * never cross between apps.
 */
export class StoreManager {
  private app: RouseApp;

  /**
   * Resolvers for `@store::name` reads, by namespace. A plugin adds its own at install.
   *
   * @internal
   */
  _namespaces = new Map<string, (storeName: string) => unknown>();

  /**
   * Store lifecycle hooks, set by a plugin at install.
   *
   * @internal
   */
  _hooks: Partial<StoreHooks> = {};

  private _stores = new Map<string, StoreEntry>();
  private _pendingFlush = new Set<StoreEntry>();
  private _isPatching = false;

  constructor(app: RouseApp) {
    this.app = app;
  }

  /**
   * Returns `true` while `entry` is the store registered under its name.
   *
   * @internal
   */
  _isRegistered(entry: StoreEntry): boolean {
    return this._stores.get(entry.name) === entry;
  }

  /**
   * Nullish-safe lookup for accessors that report absence through their own
   * return value. `_getStore` is the version that warns.
   *
   * @internal
   */
  _find(storeName: string | null | undefined) {
    return storeName == null ? undefined : this._stores.get(storeName);
  }

  /**
   * `_find` with a dev warning when the store is missing. `action` names what the
   * caller was about to do, for the message.
   *
   * @internal
   */
  _getStore(storeName: string | null | undefined, action?: string) {
    const entry = this._find(storeName);
    if (__DEV__ && !entry) {
      warn(
        !storeName
          ? 'Store name is missing.'
          : action
            ? `Cannot ${action} store '${storeName}': store not found.`
            : `Store '${storeName}' not found.`,
      );
    }
    return entry;
  }

  /**
   * Dispatches an `rz:store:patch:*` event from the store's element, or the app root.
   *
   * @internal
   */
  _dispatchPatchEvent<E extends StorePatchEvent>(
    entry: StoreEntry,
    eventName: E,
    detail: LifecycleEventMap[E],
    options?: CustomEventInit,
  ): CustomEvent<LifecycleEventMap[E]> {
    const target = entry.el ?? this.app.root;

    return dispatchFrom(
      target,
      this.app.root,
      eventName,
      detail as any,
      options,
    ) as CustomEvent<LifecycleEventMap[E]>;
  }

  /**
   * Runs a framework write, then calls the `patched` hook for `roots` or the whole store.
   *
   * @internal
   */
  _withPatchGuard(entry: StoreEntry, fn: VoidFn, roots?: string[]) {
    this._frameworkWrite(fn, () => this._hooks.patched?.(entry, roots));
  }

  /**
   * Runs `fn` with edit tracking suppressed, then `report`, the one hook that announces
   * the write, in the same batch.
   */
  private _frameworkWrite(fn: VoidFn, report: VoidFn) {
    batch(() => {
      this._isPatching = true;
      try {
        fn();
      } finally {
        this._isPatching = false;
        report();
      }
    });
  }

  /**
   * Queues a store for an end-of-microtask flush, coalescing a batch of synchronous
   * writes into one `edited` call and one round of notifications.
   */
  private _scheduleFlush(entry: StoreEntry) {
    const wasEmpty = this._pendingFlush.size === 0;
    this._pendingFlush.add(entry);
    if (!wasEmpty) {
      return;
    }

    queueMicrotask(() => {
      // Cleared before iterating, so a throwing listener can't stall later flushes
      const flushing = [...this._pendingFlush];
      this._pendingFlush.clear();

      for (const pending of flushing) {
        // Cleared before notifying, so a listener that writes starts a fresh batch. A
        // store re-queued by another store's listener arrives here with an empty set.
        const touched = pending.touched ?? new Set<string>();
        pending.touched = undefined;

        this._hooks.edited?.(pending, touched);
        pending.listeners?.forEach((callback) => callback(touched));
      }
    });
  }

  /**
   * Subscribes to user edits of a store, passing each batch's edited roots.
   * Returns an unsubscribe. Backs the `edit` trigger source. A missing store warns
   * and gets a no-op, which is how `app.on({ edit })` reports a script store
   * listened to before `start()` declared it.
   *
   * @internal
   */
  _onEdit(storeName: string | null | undefined, callback: EditListener): VoidFn {
    const entry = this._getStore(storeName);
    if (!entry) {
      return () => {};
    }

    const listeners = (entry.listeners ??= new Set());
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0 && entry.listeners === listeners) {
        entry.listeners = undefined;
      }
    };
  }

  /**
   * Registers a new store and returns its reactive proxy. `el` is the
   * `<script data-rz-store>` it was declared on, passed by `rz-store` only. The
   * public spelling is `app.store()`.
   *
   * @internal
   */
  _create<T extends object = any>(
    storeName: string,
    state: T,
    config?: StoreOptions & PersistOptions,
    el?: Element,
  ): T {
    if (this._stores.has(storeName)) {
      fail(`A store named '${storeName}' already exists.`);
    }
    assertStoreState(storeName, state);

    const { persist, persistKey, ...policy } = config ?? {};
    const persisted = resolvePersist({ persist, persistKey } as PersistOptions);

    // A store name with a dot is read as a path everywhere except through `app.stores`
    if (__DEV__ && storeName.includes('.')) {
      warn(
        `Store name '${storeName}' contains a dot, so '@${storeName}' and { edit: '${storeName}' } read as store '${storeName.slice(0, storeName.indexOf('.'))}'. Use a name without dots.`,
      );
    }

    if (__DEV__) {
      warnNullFields(storeName, state);
    }

    const { created } = this._hooks;
    const declared = created && clone(state);
    if (persisted) {
      restore(state, persisted);
    }

    const proxyState = reactive(state);
    const entry = { name: storeName, data: proxyState } as StoreEntry;
    if (el) {
      entry.el = el;
    }

    // Before registering, so a hook that rejects the store leaves nothing behind
    if (created) {
      created(entry, declared!, config && policy, !!persisted);
    } else if (__DEV__) {
      warnSyncOptions(storeName, policy);
    }

    this._stores.set(storeName, entry);

    // Copies of this callback live on every nested object the store has read, so a
    // reference kept after `remove()` would still report edits through it. With
    // nothing to notify, a batch of edits isn't worth a flush.
    trackDirty(proxyState, (rootKey: string) => {
      if (this._isPatching || !this._isRegistered(entry)) {
        return;
      }
      if (!entry.listeners && !this._hooks.edited) {
        return;
      }
      entry.touched ??= new Set();
      entry.touched.add(rootKey);
      this._scheduleFlush(entry);
    });

    if (persisted) {
      // Detached from the caller's tracking context, so a store created in a scope
      // setup keeps saving after that scope tears down
      entry.stopSaving = untracked(() => startSaving(proxyState, persisted));
    }

    return entry.data;
  }

  /**
   * Applies a `<script data-rz-store>`: creates the store on a new name, or
   * re-declares it if it's replacing the store's own detached script.
   * `state` is the script's JSON, or `undefined` when it has none.
   *
   * @internal
   */
  _declare(
    el: Element,
    storeName: string,
    state: object | undefined,
    declared: DeclaredSync,
  ) {
    const entry = this._stores.get(storeName);
    if (!entry) {
      this._create(storeName, state ?? {}, declared, el);
      return;
    }

    // The same element coming back counts as a replacement, so a moved script re-seeds
    // its store. A second owner warns where `app.store()` throws, so one bad partial
    // can't break the observer's scan.
    if (!entry.el || (entry.el !== el && entry.el.isConnected)) {
      if (__DEV__) {
        warn(
          entry.el
            ? `rz-store: store '${storeName}' is already declared by another <script> on the page. This one is ignored.`
            : `rz-store: store '${storeName}' was created in JS, so this <script> is ignored.`,
          el,
        );
      }
      return;
    }

    if (state) {
      if (__DEV__) {
        warnNullFields(storeName, state);
      }
      this._reseed(entry, state);
    }

    entry.el = el;

    const { redeclared } = this._hooks;
    if (redeclared) {
      redeclared(entry, declared);
    } else if (__DEV__) {
      warnSyncOptions(storeName, declared);
    }
  }

  /**
   * Replaces the store's data. Sends nothing. With the `sync` plugin, the new data is
   * also what `reset()` and `revert()` restore, and the store has no unsaved changes.
   */
  update<T extends object = any>(storeName: string | null | undefined, state: object): T {
    const entry = this._find(storeName);
    if (!entry) {
      fail(storeName ? `Store '${storeName}' does not exist.` : 'Store name is missing.');
    }
    assertStoreState(entry.name, state);
    if (__DEV__) {
      warnNullFields(entry.name, state);
    }

    this._reseed(entry, state);

    return entry.data;
  }

  /**
   * Replaces the store's data and calls the `reseeded` hook. Shared by `update()`,
   * `reset()`, and a re-declared script. Callers passing new state warn on null fields.
   *
   * @internal
   */
  _reseed(entry: StoreEntry, state: object) {
    this._frameworkWrite(
      () => patchState(entry.data, state, 'replace'),
      () => this._hooks.reseeded?.(entry),
    );
  }

  /**
   * Writes a payload into a store as a JSON Merge Patch, the way a fetch response
   * or a stream message routed by `data-rz-deposit="@store"` does. Fires the same
   * events a push or pull fires, so a listener sees one shape whatever produced
   * the payload.
   *
   * With the `sync` plugin, the payload's keys count as synced, as after a pull. Keys
   * it leaves out keep any unsaved changes, and `reset()` still restores the state the
   * store started with.
   *
   * @returns `false` if the store does not exist or a listener canceled the patch.
   */
  deposit(
    storeName: string | null | undefined,
    payload: object,
    options?: { response?: RouseResponse; operation?: 'fetch' | 'sse' },
  ): boolean {
    const entry = this._getStore(storeName);
    if (!entry) {
      return false;
    }

    const { data, name } = entry;
    const response = options?.response;
    const operation = options?.operation ?? 'fetch';

    const beforeEvent = this._dispatchPatchEvent(
      entry,
      'rz:store:patch:before',
      { storeName: name, operation, data, payload },
      { cancelable: true },
    );

    if (beforeEvent.defaultPrevented) {
      return false;
    }

    const applied = beforeEvent.detail.payload as object;

    // Unlike a pull, there's no mid-flight guard, and no null-field warning: a
    // deposit's `null` is its delete.
    this._frameworkWrite(
      () => patchState(data, applied, 'merge'),
      () => this._hooks.deposited?.(entry, applied),
    );

    this._dispatchPatchEvent(entry, 'rz:store:patch', {
      storeName: name,
      operation,
      data,
      payload: applied,
      response,
    });

    return true;
  }

  /**
   * Returns the reactive proxy for a store, or `undefined`.
   */
  get<T extends object = any>(storeName: string | null | undefined): T | undefined {
    return this._find(storeName)?.data;
  }

  /**
   * Returns a deep-cloned non-reactive copy of the store's current data.
   */
  snapshot<T = any>(storeName: string | null | undefined): T | undefined {
    const data = this._find(storeName)?.data;
    return data ? clone(data) : undefined;
  }

  /**
   * Returns `true` if a store with the provided name exists.
   */
  has(storeName: string | null | undefined): boolean {
    return this._find(storeName) !== undefined;
  }

  /**
   * Drops all per-store state from the manager. Intended for tear-down of
   * dynamically-created stores.
   *
   * Existing references to the proxy keep working but desync: edits through them
   * won't fire `edit` triggers, and an in-flight request won't
   * apply its response.
   */
  remove(storeName: string | null | undefined) {
    const entry = this._find(storeName);
    if (!entry) {
      return;
    }

    // A running flush has its own copy of the queue, so listeners can also be cleared
    this._hooks.removed?.(entry);
    entry.stopSaving?.();
    entry.listeners = undefined;
    entry.touched = undefined;
    this._pendingFlush.delete(entry);
    this._stores.delete(entry.name);

    // Left as they are: an object moved from this store into a new one keeps this
    // store's tracker, `edit` triggers bound now never fire for a store re-created under
    // the name, and a removal from the store's own `:before` listener still gets that
    // response applied.
  }

  /**
   * Stops every persisted store from saving. Called once by `app.destroy()`.
   *
   * @internal
   */
  _stopSaving() {
    this._stores.forEach((entry) => entry.stopSaving?.());
  }
}
