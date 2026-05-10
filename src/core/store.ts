import { request } from '../net/request';
import { nonReactive, reactive, readOnly, trackDirty } from '../reactivity';
import type { DirectiveSlug, RouseRequest, RouseResponse } from '../types';
import type { RouseConfig } from './app';
import { STORE_PREFIX } from './constants';
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
  saveMethod?: string;
  refreshMethod?: string;
  action?: 'replace' | 'merge';
}

export interface StoreRequestOptions {
  url?: string;
  method?: string;
  overrides?: Partial<RouseRequest>;
  nestedPath?: string;
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
 * The central manager for all reactive stores and their network logic.
 * Instantiated once per RouseApp to ensure isolation.
 */
export class StoreManager {
  private appConfig: RouseConfig;

  private _data = new Map<string, any>();
  private _status = new Map<string, StoreStatus>();
  private _configs = new Map<string, SyncConfig>();
  private _initial = new Map<string, any>();
  private _activeReqs = new Map<string, symbol>();
  private _elements = new Map<string, Element>();
  private _isPatching = false;

  constructor(appConfig: RouseConfig) {
    this.appConfig = appConfig;
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
      save: (config?: { url?: string; method?: string }) => this.save(id, config),
      refresh: (config?: { url?: string; method?: string }) => this.refresh(id, config),
      reset: () => this.reset(id),
    };

    // Expose __actions invisibly
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
      status.dirty[rootKey] = true;
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
    const url = manualConfig?.url || overrides.url || config?.url;
    const defaultMethod = operation === 'save' ? 'POST' : 'GET';
    const storeMethod = operation === 'save' ? config?.saveMethod : config?.refreshMethod;
    const method =
      manualConfig?.method || overrides.method || storeMethod || defaultMethod;

    if (!url) {
      warn(`Cannot ${operation} store '${id}': No URL configured.`);
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
      const result = await request(url, requestOptions, this.appConfig);
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
    } finally {
      // Only disable the loading state if this is the most recent request
      if (this._activeReqs.get(id) === reqToken) {
        status.loading = false;
        this._activeReqs.delete(id);
      }
    }
  }

  private _applyServerResponse(
    id: string,
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

    if (operation === 'save') {
      // Save accepted = synced
      status.lastSync = Date.now();

      // Clear dirty flags only for what was actually saved
      const rootKey = getRootSegment(manualConfig?.nestedPath);
      const keys = rootKey ? [rootKey] : Object.keys(snapshot);
      for (const key of keys) {
        if (Object.hasOwn(snapshot, key) && deepEqual(data[key], snapshot[key])) {
          delete status.dirty[key];
        }
      }
    }

    if (result.data && typeof result.data === 'object') {
      const path = manualConfig?.nestedPath;
      const localSlice = path ? getNestedVal(data, path) : data;
      const snapSlice = path ? getNestedVal(snapshot, path) : snapshot;

      // Check if local state is being mutated while the network is busy
      const isMutating = !deepEqual(localSlice, snapSlice);

      // Safe to apply server update
      if (!isMutating) {
        const action = config?.action || 'replace';
        if (path) {
          const incoming = getNestedVal(result.data, path);
          if (incoming !== undefined) {
            const target = getNestedVal(data, path);
            if (
              action === 'merge' &&
              target &&
              typeof target === 'object' &&
              incoming &&
              typeof incoming === 'object'
            ) {
              this._runPatch(target, incoming, 'merge');
            } else {
              setNestedVal(data, path, incoming);
            }
          }
        } else {
          this._runPatch(data, result.data, action);
        }

        if (operation === 'refresh') {
          this._initial.set(id, clone(result.data));
          // Refresh applied = synced
          status.lastSync = Date.now();
        }
      }
    }
  }

  /**
   * Intercepts the raw payload to apply framework instructions (like nonReactive)
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

    // Handle readOnly paths
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

  private _runPatch(
    target: Record<string, any>,
    source: Record<string, any>,
    strategy: 'replace' | 'merge' = 'replace',
  ) {
    this._isPatching = true;
    try {
      patchState(target, source, strategy);
    } finally {
      this._isPatching = false;
    }
  }

  // -------------------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------------------

  elementFor(name: string): Element | undefined {
    return this._elements.get(name);
  }

  elements(): Iterable<Element> {
    return this._elements.values();
  }

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

    return this._data.get(name);
  }

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
    this._runPatch(this._data.get(name), state, action);

    this._initial.set(name, clone(state));
    if (config) {
      this._setConfig(name, config);
    }

    return this._data.get(name);
  }

  get<T extends object = any>(name: string): RouseStore<T> | undefined {
    return this._data.get(name);
  }

  snapshot<T = any>(name: string): T | undefined {
    const data = this._data.get(name);
    return data ? clone(data) : undefined;
  }

  has(name: string): boolean {
    return this._data.has(name);
  }

  status(name: string): StoreStatus | undefined {
    return this._status.get(name);
  }

  config(name: string, config: Partial<SyncConfig>) {
    if (!this.has(name)) {
      warn(`Cannot configure '${name}'. Store not found.`);
      return;
    }
    this._setConfig(name, config);
  }

  async save(name: string, config?: StoreRequestOptions): Promise<void> {
    return this._request(name, 'save', config);
  }

  async refresh(name: string, config?: StoreRequestOptions): Promise<void> {
    // Avoid clobbering an in-flight save with stale server data
    if (this.status(name)?.loading === 'save') return;

    return this._request(name, 'refresh', config);
  }

  reset(name: string) {
    const data = this._data.get(name);
    const initial = this._initial.get(name);
    if (!data) {
      return warn(`Cannot reset store '${name}': Store not found.`);
    }
    if (!initial) {
      return warn(`Cannot reset store '${name}': No initial state cached.`);
    }
    this._runPatch(data, clone(initial), 'replace');
  }

  remove(name: string) {
    this._data.delete(name);
    this._status.delete(name);
    this._configs.delete(name);
    this._elements.delete(name);
    this._initial.delete(name);
    this._activeReqs.delete(name);
  }
}
