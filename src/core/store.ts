import { getStoreName } from '../directives';
import { request } from '../net/request';
import { reactive } from '../reactivity';

export interface StoreStatus {
  loading: boolean;
  error: string | null;
  lastSync: number;
}

export interface SyncConfig {
  url: string;
  saveMethod?: string;
  refreshMethod?: string;
}

export interface StoreManager {
  get: <T = any>(name: string) => T | undefined;
  snapshot: <T = any>(name: string) => T | undefined;
  has: (name: string) => boolean;
  status: (name: string) => StoreStatus | undefined;
  save: (name: string, config?: { url: string; method?: string }) => Promise<void>;
  refresh: (name: string, config?: { url: string; method?: string }) => Promise<void>;
  reset: (name: string) => void;
  remove: (name: string) => void;
}

/**
 * A highly optimized deep cloner that enforces serializable state and
 * protects against circular reference stack overflows.
 */
function clone<T>(obj: T, seen = new WeakMap()): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Prevent circular reference stack overflow
  if (seen.has(obj as any)) {
    return seen.get(obj as any);
  }

  // Arrays: JSON converts functions/undefined to null to preserve indexes
  // This also normalizes sparse arrays (holes become null).
  if (Array.isArray(obj)) {
    const arr = [] as any[];
    seen.set(obj as any, arr);
    for (let i = 0; i < obj.length; i++) {
      const val = obj[i];
      arr[i] = typeof val === 'function' || val === undefined ? null : clone(val, seen);
    }
    return arr as unknown as T;
  }

  // Objects: JSON completely strips properties that are functions or undefined
  const result = {} as Record<string, any>;
  seen.set(obj as any, result); // Record before recursing
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const val = (obj as Record<string, any>)[key];
      if (typeof val !== 'function' && val !== undefined) {
        result[key] = clone(val, seen);
      }
    }
  }

  return result as T;
}

/**
 * Performant deep equality check with circular reference protection.
 * Optimized for O(N) traversal and avoids array allocations.
 * Ignores non-serializable properties (functions/undefined) to align with clone().
 */
function deepEqual(a: any, b: any, seen = new WeakMap<object, any>()): boolean {
  if (a === b) {
    return true;
  }
  // Handle NaN (NaN !== NaN)
  if (
    typeof a === 'number' &&
    typeof b === 'number' &&
    Number.isNaN(a) &&
    Number.isNaN(b)
  ) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }

  // Circular reference protection
  if (seen.has(a)) {
    return seen.get(a) === b;
  }
  seen.set(a, b);

  // Fast path: constructor check
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // Arrays: match JSON behavior (functions/undefined become null)
  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      const valA = typeof a[i] === 'function' || a[i] === undefined ? null : a[i];
      const valB = typeof b[i] === 'function' || b[i] === undefined ? null : b[i];
      if (!deepEqual(valA, valB, seen)) {
        return false;
      }
    }
    return true;
  }

  // Objects: O(N) traversal, ignoring non-serializable keys without allocating arrays
  let validKeysA = 0;
  for (const key in a) {
    if (Object.hasOwn(a, key)) {
      const valA = a[key];
      if (typeof valA !== 'function' && valA !== undefined) {
        validKeysA++;
        // Fast O(1) lookup instead of O(N) .includes()
        if (!Object.hasOwn(b, key)) {
          return false;
        }
        if (!deepEqual(valA, b[key], seen)) {
          return false;
        }
      }
    }
  }

  // Count valid keys in B to ensure no extra serializable keys exist
  let validKeysB = 0;
  for (const key in b) {
    if (Object.hasOwn(b, key)) {
      const valB = b[key];
      if (typeof valB !== 'function' && valB !== undefined) {
        validKeysB++;
      }
    }
  }

  return validKeysA === validKeysB;
}

/**
 * Replaces the state of a reactive target to exactly match the source.
 * This ensures properties deleted by the server are removed from the UI.
 */
function replaceState(target: Record<string, any>, source: Record<string, any>) {
  for (const key in target) {
    if (!Object.hasOwn(source, key)) {
      delete target[key];
    }
  }
  Object.assign(target, source);
}

/**
 * The central registry for all reactive stores and their save logic.
 */
export const coreStore = {
  _data: new Map<string, any>(),
  _status: new Map<string, StoreStatus>(),
  _configs: new Map<string, SyncConfig>(),
  _initial: new Map<string, any>(),
  _activeReqs: new Map<string, symbol>(), // Tracks the latest request token

  _createStatus(): StoreStatus {
    return reactive({ loading: false, error: null, lastSync: 0 });
  },

  _setConfig(id: string, partial?: Partial<SyncConfig>) {
    const existing = this._configs.get(id) || { url: '' };
    this._configs.set(id, { ...existing, ...partial });
  },

  _register(id: string, state: object, programmaticConfig?: Partial<SyncConfig>) {
    this._data.set(id, reactive(state));
    this._initial.set(id, clone(state));
    this._status.set(id, this._createStatus());
    if (programmaticConfig) {
      this._setConfig(id, programmaticConfig);
    }
  },

  _getStore(id: string) {
    const data = this._data.get(id);
    const status = this._status.get(id);
    const config = this._configs.get(id);

    if (!data || !status) {
      console.warn(`[Rouse] Store "${id}" not found.`);
      return undefined;
    }

    return { data, status, config };
  },

  /**
   * Internal unified request handler for save and refresh operations.
   */
  async _request(
    id: string,
    operation: 'save' | 'refresh',
    manualConfig?: { url: string; method?: string },
  ) {
    const store = this._getStore(id);
    if (!store) return;

    const { data, status, config } = store;

    // Resolve the URL
    const url = manualConfig?.url || config?.url;

    // Method routing
    const defaultMethod = operation === 'save' ? 'POST' : 'GET';
    const storeMethod = operation === 'save' ? config?.saveMethod : config?.refreshMethod;
    const method = manualConfig?.method || storeMethod || defaultMethod;

    if (!url) {
      console.warn(`[Rouse] Cannot ${operation} store "${id}": No URL configured.`);
      return;
    }

    // Generate a unique token for this network request
    const reqToken = Symbol();
    this._activeReqs.set(id, reqToken);

    // Snaphot used to diff the server and client state
    const snapshot = clone(data);
    status.loading = true;
    status.error = null;

    try {
      const result = await request(url, {
        method,
        ...(operation === 'save' && { body: data }),
        abortKey: `${operation}_${id}`,
      });

      if (result.error) {
        if (result.error.status === 'CANCELED') return;
        throw result.error;
      }

      if (result.data && typeof result.data === 'object') {
        // Check if local state is being mutated while the network is busy
        const isMutating = !deepEqual(data, snapshot);

        if (!isMutating) {
          // Safe to apply server update
          replaceState(data, result.data);

          if (operation === 'refresh') {
            this._initial.set(id, clone(result.data));
          }
        }
      }
      status.lastSync = Date.now();
    } catch (e: any) {
      // If a save fails, roll back to the snapshot (unless mutated)
      if (operation === 'save' && deepEqual(data, snapshot)) {
        replaceState(data, snapshot);
      }
      status.error = e;
    } finally {
      // Only disable the loading state if this is the most recent request
      if (this._activeReqs.get(id) === reqToken) {
        status.loading = false;
        this._activeReqs.delete(id);
      }
    }
  },

  define(name: string, state: object, config?: Partial<SyncConfig>) {
    if (this._data.has(name)) {
      replaceState(this._data.get(name), state);
      this._initial.set(name, clone(state));
      if (config) {
        this._setConfig(name, config);
      }
    } else {
      this._register(name, state, config);
    }
  },

  /**
   * Initializes a global store directly from a <script> tag.
   */
  initScript(el: HTMLScriptElement) {
    const name = getStoreName(el);
    if (!name) return;
    if (this._data.has(name) && !el.textContent) return;

    let newJson: any;
    try {
      newJson = JSON.parse(el.textContent || '{}');
    } catch (_e: any) {
      console.error(`[Rouse] Invalid JSON in "${name}". Store not initialized.`);
      return;
    }

    if (this._data.has(name)) {
      replaceState(this._data.get(name), newJson);
      this._initial.set(name, clone(newJson));
    } else {
      this._register(name, newJson);
    }
  },

  async save(id: string, manualConfig?: { url: string; method?: string }) {
    return this._request(id, 'save', manualConfig);
  },

  async refresh(id: string, manualConfig?: { url: string; method?: string }) {
    return this._request(id, 'refresh', manualConfig);
  },

  reset(id: string) {
    const data = this._data.get(id);
    const initial = this._initial.get(id);

    if (!data) {
      console.warn(`[Rouse] Cannot reset store "${id}": Store not found.`);
      return;
    }

    if (!initial) {
      console.warn(`[Rouse] Cannot reset store "${id}": No initial state cached.`);
      return;
    }

    replaceState(data, clone(initial));
  },

  remove(id: string) {
    this._data.delete(id);
    this._status.delete(id);
    this._configs.delete(id);
    this._initial.delete(id);
    this._activeReqs.delete(id);
  },
};

/**
 * Public API to programmatically define a global store with an optional save config.
 */
export function store<T extends object>(
  name: string,
  state: T,
  config?: Partial<SyncConfig>,
): void {
  coreStore.define(name, state, config);
}

/**
 * The stores API. Available in Rouse.stores and via ctx.stores in controllers.
 */
export const stores: StoreManager = {
  get<T = any>(name: string): T | undefined {
    return coreStore._data.get(name);
  },
  snapshot<T = any>(name: string): T | undefined {
    const data = coreStore._data.get(name);
    return data ? clone(data) : undefined;
  },
  has(name: string): boolean {
    return coreStore._data.has(name);
  },
  status(name: string): StoreStatus | undefined {
    return coreStore._status.get(name);
  },
  save(name: string, config?: { url: string; method?: string }): Promise<void> {
    return coreStore.save(name, config);
  },
  refresh(name: string, config?: { url: string; method?: string }): Promise<void> {
    return coreStore.refresh(name, config);
  },
  reset(name: string) {
    coreStore.reset(name);
  },
  remove(name: string) {
    coreStore.remove(name);
  },
};
