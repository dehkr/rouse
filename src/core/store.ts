import { dispatch } from '../dom/scheduler';
import { request } from '../net/request';
import { nonReactive, reactive, readOnly, trackDirty } from '../reactivity';
import { seedPropagation } from '../reactivity/reactive';
import type {
  DirectiveSlug,
  FetchConfig,
  LifecycleEvent,
  RouseRequest,
  RouseResponse,
  StoreSyncConflictDetail,
  StoreSyncDetail,
  StoreSyncErrorDetail,
  StoreSyncRollbackDetail,
  VoidFn,
} from '../types';
import type { RouseApp } from './app';
import { STORE_PREFIX, type HttpMethod, type PatchAction } from './constants';
import { parseStoreLocator } from './parser';
import { getNestedVal, getRootSegment, setNestedVal } from './path';
import { getDirectiveValue, isPlainObject, warn } from './shared';
import { clone, deepEqual, patchState } from './state';

export interface StoreStatus {
  loading: false | 'save' | 'refresh';
  error: string | null;
  lastSync: number;
  dirty: Record<string, boolean>;
}

export interface StoreTarget {
  storeName: string;
  nestedPath: string;
}

export type RouseStore<T extends object = any> = T & {
  readonly __status: StoreStatus;
};

export interface SyncConfig {
  url: string;
  saveMethod?: HttpMethod;
  refreshMethod?: HttpMethod;
  action?: PatchAction;
  rollbackOnError?: boolean;
}

export interface StoreRequestOptions {
  url?: string;
  method?: HttpMethod;
  action?: PatchAction;
  overrides?: Partial<RouseRequest>;
  nestedPath?: string;
  rollbackOnError?: boolean;
}

/**
 * Resolves a save subject into a store name and optional nested path.
 * `null` subject means self-target (use `rz-store` on the same element).
 */
export function resolveTarget(
  el: Element,
  slug: Extract<DirectiveSlug, 'save' | 'refresh'>,
  subject: string | null,
  supportsNestedPath = true,
): StoreTarget | null {
  if (subject) {
    if (!subject.startsWith(STORE_PREFIX)) {
      warn(`rz-${slug} target must be a store reference (e.g. '@store'): '${subject}'.`);
      return null;
    }
    const { storeName, nestedPath } = parseStoreLocator(subject);
    if (!storeName) {
      warn(`rz-${slug}: invalid store reference '${subject}'.`);
      return null;
    }
    return { storeName, nestedPath: supportsNestedPath ? nestedPath : '' };
  }

  const selfName = getDirectiveValue(el, 'store')?.trim();
  if (!selfName) {
    warn(`rz-${slug} requires rz-store on the same element.`);
    return null;
  }
  return { storeName: selfName, nestedPath: '' };
}

/**
 * Resolves a store reference to a string value intended for use as a URL.
 */
export function resolveStoreUrl(ref: string, stores: StoreManager): string | null {
  if (!ref.startsWith(STORE_PREFIX)) return ref;

  const { storeName, nestedPath } = parseStoreLocator(ref);
  const storeData = stores.get(storeName);

  const value = getNestedVal(storeData, nestedPath);

  if (!value || typeof value !== 'string' || !value.trim()) {
    warn(`Invalid URL. '${ref}' does not resolve to a string.`);
    return null;
  }

  return value;
}

/**
 * The central manager for all reactive stores and their network logic.
 * Instantiated once per RouseApp to ensure isolation.
 */
export class StoreManager {
  private app: RouseApp;

  private _data = new Map<string, any>();
  private _status = new Map<string, StoreStatus>();
  private _configs = new Map<string, SyncConfig>();
  private _initial = new Map<string, any>();
  private _lastGood = new Map<string, any>();
  private _activeReqs = new Map<string, symbol>();
  private _elements = new Map<string, Element>();
  private _mutateListeners = new Map<string, Set<VoidFn>>();
  private _pendingMutates = new Set<string>();
  private _isPatching = false;

  constructor(app: RouseApp) {
    this.app = app;
  }

  private _createStatus(): StoreStatus {
    return reactive({
      loading: false,
      error: null,
      lastSync: 0,
      dirty: {},
    });
  }

  _setConfig(id: string, partial?: Partial<SyncConfig>) {
    const existing = this._configs.get(id) || { url: '' };
    this._configs.set(id, { ...existing, ...partial });
  }

  private _register(
    id: string,
    state: object,
    programmaticConfig?: Partial<SyncConfig>,
    el?: Element,
  ) {
    const status = this._createStatus();
    this._status.set(id, status);

    const actions = {
      save: (config?: { url?: string; method?: HttpMethod }) => this.save(id, config),
      refresh: (config?: { url?: string; method?: HttpMethod }) =>
        this.refresh(id, config),
      reset: () => this.reset(id),
    };

    // expose __actions invisibly
    Object.defineProperty(state, '__actions', {
      value: actions,
      enumerable: false,
      configurable: true,
      writable: false,
    });

    // Expose __status invisibly
    Object.defineProperty(state, '__status', {
      value: status,
      enumerable: false,
      configurable: true,
      writable: false,
    });

    const proxyState = reactive(state);
    this._data.set(id, proxyState);
    this._initial.set(id, clone(state));

    trackDirty(proxyState, (rootKey: string) => {
      if (this._isPatching) return;
      this._withPatchGuard(() => {
        status.dirty[rootKey] = true;
      });
      this._scheduleMutate(id);
    });

    if (programmaticConfig) {
      this._setConfig(id, programmaticConfig);
    }

    if (el) {
      this._elements.set(id, el);
    }
  }

  private _getStore(id: string) {
    const data = this._data.get(id);
    const status = this._status.get(id);
    const config = this._configs.get(id);

    if (!data || !status) {
      warn(`Store '${id}' not found.`);
      return undefined;
    }

    return { data, status, config };
  }

  private _refreshLastGood(storeName: string, data: any) {
    this._lastGood.set(storeName, clone(data));
  }

  private _dispatchSyncEvent(
    eventName: LifecycleEvent,
    detail:
      | StoreSyncDetail
      | StoreSyncConflictDetail
      | StoreSyncErrorDetail
      | StoreSyncRollbackDetail,
    storeName: string,
    options: CustomEventInit = { cancelable: false },
  ) {
    const target = this.elementFor(storeName) || (this.app.config.root as Element);
    return dispatch(target, eventName, detail, options);
  }

  /**
   * Internal unified request handler for save and refresh operations.
   */
  private async _request(
    id: string,
    operation: 'save' | 'refresh',
    manualConfig?: StoreRequestOptions,
  ) {
    const store = this._getStore(id);
    if (!store) return;

    const { data, status, config } = store;
    const overrides = manualConfig?.overrides ?? {};

    const rawUrl = manualConfig?.url || overrides.url || config?.url;
    const url = rawUrl ? resolveStoreUrl(rawUrl, this) : null;

    const defaultMethod = operation === 'save' ? 'POST' : 'GET';
    const storeMethod = operation === 'save' ? config?.saveMethod : config?.refreshMethod;
    const method =
      manualConfig?.method || overrides.method || storeMethod || defaultMethod;

    if (!url) {
      warn(`Cannot ${operation} store '${id}': URL not configured.`);
      return;
    }

    const requestOptions: RouseRequest = {
      ...overrides,
      method,
      abortKey: overrides.abortKey ?? `${operation}_${id}`,
    };

    // Body for save: full data, or a nested slice if nestedPath is provided
    if (operation === 'save') {
      requestOptions.body = manualConfig?.nestedPath
        ? getNestedVal(data, manualConfig.nestedPath)
        : data;
    }

    // Unique token for this specific network request
    const reqToken = Symbol();
    this._activeReqs.set(id, reqToken);

    // Snaphot used to diff the server and client state
    const snapshot = clone(data);
    status.loading = operation;
    status.error = null;

    try {
      const result = await request(url, requestOptions, this.app);
      this._applyServerResponse(
        id,
        operation,
        result,
        data,
        status,
        config,
        snapshot,
        manualConfig,
      );
    } catch (e: any) {
      status.error = e;

      this._dispatchSyncEvent(
        'rz:store:sync:error',
        { storeName: id, operation, data, error: e },
        id,
      );

      // Rollback resolution chain
      const rollbackOnError =
        manualConfig?.rollbackOnError ??
        (requestOptions as FetchConfig).rollbackOnError ??
        config?.rollbackOnError ??
        false;

      if (operation === 'save' && rollbackOnError) {
        this._maybeRollback(id, data, status, snapshot, manualConfig?.nestedPath, e);
      }
    } finally {
      // Only disable the loading state if this is the most recent request
      if (this._activeReqs.get(id) === reqToken) {
        status.loading = false;
        this._activeReqs.delete(id);
      }
    }
  }

  private _applyServerResponse(
    storeName: string,
    operation: 'save' | 'refresh',
    result: RouseResponse,
    data: any,
    status: StoreStatus,
    config: SyncConfig | undefined,
    snapshot: any,
    manualConfig?: StoreRequestOptions,
  ) {
    if (result.error) {
      if (result.error.status === 'CANCELED') return;
      throw result.error;
    }

    const action = manualConfig?.action || config?.action || 'replace';
    const nestedPath = manualConfig?.nestedPath;

    this._dispatchSyncEvent(
      'rz:store:sync:before',
      { storeName, operation, data, nestedPath, action },
      storeName,
    );

    if (operation === 'save') {
      // Save accepted = synced
      status.lastSync = Date.now();

      // Clear dirty flags only for what was actually saved
      const rootKey = getRootSegment(nestedPath);
      const keys = rootKey ? [rootKey] : Object.keys(snapshot);
      for (const key of keys) {
        if (Object.hasOwn(snapshot, key) && deepEqual(data[key], snapshot[key])) {
          delete status.dirty[key];
        }
      }
    }

    if (result.data && typeof result.data === 'object') {
      const localSlice = nestedPath ? getNestedVal(data, nestedPath) : data;
      const snapSlice = nestedPath ? getNestedVal(snapshot, nestedPath) : snapshot;
      const isMutating = !deepEqual(localSlice, snapSlice);

      // Apply server update if local state is not being mutated during request
      if (!isMutating) {
        if (nestedPath) {
          const incoming = getNestedVal(result.data, nestedPath);
          if (incoming !== undefined) {
            this._withPatchGuard(() => {
              const target = getNestedVal(data, nestedPath);
              if (
                action === 'merge' &&
                target &&
                typeof target === 'object' &&
                incoming &&
                typeof incoming === 'object'
              ) {
                patchState(target, incoming, 'merge');
              } else {
                setNestedVal(data, nestedPath, incoming);
              }
            });
          }
        } else {
          this._withPatchGuard(() => patchState(data, result.data, action));
        }
      } else {
        // Is mutating. Dispatch sync conflict lifecycle event.
        this._dispatchSyncEvent(
          'rz:store:sync:conflict',
          {
            storeName,
            operation,
            localData: localSlice,
            serverData: nestedPath ? getNestedVal(result.data, nestedPath) : result.data,
            response: result,
            nestedPath,
            action,
            reason: 'mutating',
          },
          storeName,
        );

        return;
      }
    }

    if (operation === 'refresh') {
      status.lastSync = Date.now();
    }

    this._refreshLastGood(storeName, data);

    this._dispatchSyncEvent(
      'rz:store:sync',
      { storeName, operation, data, response: result, nestedPath, action },
      storeName,
    );
  }

  /**
   * Intercepts the raw payload to apply framework instructions (like `nonReactive`)
   * before the data is wrapped in proxies or merged into state.
   */
  private _processMeta(payload: unknown) {
    if (!isPlainObject(payload) || !payload.__meta) return;

    const meta = payload.__meta;
    const isObject = (target: unknown) =>
      target !== undefined && typeof target === 'object' && target !== null;

    if (Array.isArray(meta.nonReactive)) {
      for (const path of meta.nonReactive) {
        const target = getNestedVal(payload, path);
        if (isObject(target)) {
          nonReactive(target);
        }
      }
    }

    // Handle `readOnly` paths
    if (Array.isArray(meta.readOnly)) {
      for (const path of meta.readOnly) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        if (!lastKey) continue;

        let parent = payload;
        let failed = false;

        // Traverse remaining keys to find the final parent
        for (const key of keys) {
          if (!isObject(parent[key])) {
            failed = true;
            break;
          }
          parent = parent[key];
        }

        if (!failed && isObject(parent[lastKey])) {
          parent[lastKey] = readOnly(parent[lastKey]);
        }
      }
    }

    delete payload.__meta;
  }

  private _withPatchGuard(fn: VoidFn) {
    this._isPatching = true;
    try {
      fn();
    } finally {
      this._isPatching = false;
    }
  }

  private _clearAllDirty(storeName: string) {
    const status = this._status.get(storeName);
    if (!status) return;
    for (const key of Object.keys(status.dirty)) {
      delete status.dirty[key];
    }
  }

  private _maybeRollback(
    storeName: string,
    data: any,
    status: StoreStatus,
    snapshot: any,
    nestedPath: string | undefined,
    error: unknown,
  ): boolean {
    const lastGood = this._lastGood.get(storeName);
    if (lastGood === undefined) return false;

    // Skip when the user has kept editing during flight
    const localSlice = nestedPath ? getNestedVal(data, nestedPath) : data;
    const snapSlice = nestedPath ? getNestedVal(snapshot, nestedPath) : snapshot;
    if (!deepEqual(localSlice, snapSlice)) return false;

    // Skip if data already equals lastGood (avoids firing errant signals)
    const lastGoodSlice = nestedPath ? getNestedVal(lastGood, nestedPath) : lastGood;
    if (deepEqual(localSlice, lastGoodSlice)) return false;

    const rolledBackTo = nestedPath
      ? clone(getNestedVal(lastGood, nestedPath))
      : clone(lastGood);

    this._withPatchGuard(() => {
      if (nestedPath) {
        setNestedVal(data, nestedPath, rolledBackTo);
      } else {
        patchState(data, rolledBackTo, 'replace');
      }
    });

    const rootKey = getRootSegment(nestedPath);
    const keys = rootKey ? [rootKey] : Object.keys(lastGood);
    for (const key of keys) {
      if (Object.hasOwn(lastGood, key) && deepEqual(data[key], lastGood[key])) {
        delete status.dirty[key];
      }
    }

    this._dispatchSyncEvent(
      'rz:store:sync:rollback',
      {
        storeName,
        operation: 'save',
        data,
        rolledBackTo,
        nestedPath,
        error,
        reason: 'save-error',
      },
      storeName,
    );

    return true;
  }

  private _scheduleMutate(name: string) {
    if (!this._mutateListeners.has(name)) return;
    const wasEmpty = this._pendingMutates.size === 0;
    this._pendingMutates.add(name);
    if (wasEmpty) {
      queueMicrotask(() => {
        const toNotify = [...this._pendingMutates];
        this._pendingMutates.clear();
        for (const n of toNotify) {
          const listeners = this._mutateListeners.get(n);
          if (listeners) {
            for (const cb of listeners) cb();
          }
        }
      });
    }
  }

  // =====================================================================================
  // PUBLIC API
  // =====================================================================================

  /**
   * Listens for user-driven mutations to the store. Returns a cleanup function.
   */
  onMutate(name: string, callback: () => void): VoidFn {
    let listeners = this._mutateListeners.get(name);
    if (!listeners) {
      listeners = new Set();
      this._mutateListeners.set(name, listeners);
      // Seed lazy tracker propagation across the initial tree
      const data = this._data.get(name);
      if (data) seedPropagation(data);
    }
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) this._mutateListeners.delete(name);
    };
  }

  /**
   * Retrieves the source `<script rz-store>` element for a registered store.
   */
  elementFor(name: string): Element | undefined {
    return this._elements.get(name);
  }

  /**
   * Returns an iterable object containing every `<script rz-store>` element
   * registered in the store manager.
   */
  elements(): Iterable<Element> {
    return this._elements.values();
  }

  /**
   * Registers a new store and returns its reactive proxy.
   */
  create<T extends object = any>(
    name: string,
    state: object,
    config?: Partial<SyncConfig>,
    el?: Element,
  ): RouseStore<T> {
    if (this._data.has(name)) {
      throw new Error(`[Rouse] A store named '${name}' already exists.`);
    }

    this._processMeta(state);
    this._register(name, state, config, el);
    this._refreshLastGood(name, state);

    return this._data.get(name);
  }

  /**
   * Overwrites store state, clears dirty flags, resets the store's initial data
   * snapshot, and refreshes the snapshop of the most recently server-confirmed state.
   */
  update<T extends object = any>(
    name: string,
    state: object,
    config?: Partial<SyncConfig>,
  ): RouseStore<T> {
    if (!this._data.has(name)) {
      throw new Error(`[Rouse] Store '${name}' does not exist.`);
    }

    this._processMeta(state);

    const action = config?.action || this._configs.get(name)?.action || 'replace';

    this._withPatchGuard(() => patchState(this._data.get(name), state, action));
    this._initial.set(name, clone(state));
    this._refreshLastGood(name, state);
    this._clearAllDirty(name);

    if (config) {
      this._setConfig(name, config);
    }

    return this._data.get(name);
  }

  /**
   * Returns the reactive proxy for a store, or `undefined`.
   */
  get<T extends object = any>(name: string): RouseStore<T> | undefined {
    return this._data.get(name);
  }

  /**
   * Returns a deep-cloned non-reactive copy of the store's current data.
   */
  snapshot<T = any>(name: string): T | undefined {
    const data = this._data.get(name);
    return data ? clone(data) : undefined;
  }

  /**
   * Returns `true` if a store with the provided name exists.
   */
  has(name: string): boolean {
    return this._data.has(name);
  }

  /**
   * Returns the status object for a store, or `undefined`. Available store
   * status properties are `loading`, `error`, `lastSync`, and `dirty`.
   */
  status(name: string): StoreStatus | undefined {
    return this._status.get(name);
  }

  /**
   * Patches `SyncConfig` for a store. Warns if the store is missing.
   */
  config(name: string, config: Partial<SyncConfig>) {
    if (!this.has(name)) {
      warn(`Cannot configure '${name}'. Store not found.`);
      return;
    }
    this._setConfig(name, config);
  }

  /**
   * Triggers a manual store save with optional request overrides.
   */
  async save(name: string, config?: StoreRequestOptions): Promise<void> {
    return this._request(name, 'save', config);
  }

  /**
   * Pulls fresh store data from the server, unless a save is currently in flight.
   */
  async refresh(name: string, config?: StoreRequestOptions): Promise<void> {
    if (this.status(name)?.loading === 'save') return;
    return this._request(name, 'refresh', config);
  }

  /**
   * Reverts a store to its initial state, clears dirty flags, and refreshes
   * the snapshop of the most recently server-confirmed state.
   */
  reset(name: string) {
    const data = this._data.get(name);
    const initial = this._initial.get(name);

    if (!data) {
      warn(`Cannot reset store '${name}': Store not found.`);
      return;
    }

    if (!initial) {
      warn(`Cannot reset store '${name}': No initial state cached.`);
      return;
    }

    this._withPatchGuard(() => patchState(data, clone(initial), 'replace'));
    this._refreshLastGood(name, data);
    this._clearAllDirty(name);
  }

  /**
   * Drops all per-store state from the manager. Existing references to the proxy
   * keep working but desync. Intended for tear-down of dynamically-created stores.
   */
  remove(name: string) {
    this._data.delete(name);
    this._status.delete(name);
    this._configs.delete(name);
    this._elements.delete(name);
    this._initial.delete(name);
    this._lastGood.delete(name);
    this._activeReqs.delete(name);
  }
}
