import { getStoreName } from '../directives';
import { request } from '../net/request';
import { reactive } from '../reactivity';
import type { RouseConfig } from './app';

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

export const STORE_PREFIX = '@';

/**
 * Extracts the store name and the nested path (if any)
 */
export function parseStoreLocator(value: string): {
  storeName: string;
  nestedPath: string;
} {
  const path = value.slice(STORE_PREFIX.length);
  const dotIndex = path.indexOf('.');

  if (dotIndex === -1) {
    return { storeName: path, nestedPath: '' };
  }

  return {
    storeName: path.slice(0, dotIndex),
    nestedPath: path.slice(dotIndex + 1),
  };
}

/**
 * Deep oject cloner that enforces serializable state and
 * protects against circular references.
 */
function clone<T>(obj: T, seen = new WeakMap()): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Circular reference protection
  if (seen.has(obj as any)) {
    return seen.get(obj as any);
  }

  // Arrays
  // JSON converts functions/undefined to null to preserve indexes.
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

  // Objects
  // JSON completely strips properties that are functions or undefined.
  const result = {} as Record<string, any>;
  seen.set(obj as any, result);

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

  constructor(appConfig: RouseConfig) {
    this.appConfig = appConfig;
  }

  private _createStatus(): StoreStatus {
    return reactive({ loading: false, error: null, lastSync: 0 });
  }

  _setConfig(id: string, partial?: Partial<SyncConfig>) {
    const existing = this._configs.get(id) || { url: '' };
    this._configs.set(id, { ...existing, ...partial });
  }

  private _register(id: string, state: object, programmaticConfig?: Partial<SyncConfig>) {
    this._data.set(id, reactive(state));
    this._initial.set(id, clone(state));
    this._status.set(id, this._createStatus());
    if (programmaticConfig) {
      this._setConfig(id, programmaticConfig);
    }
  }

  private _getStore(id: string) {
    const data = this._data.get(id);
    const status = this._status.get(id);
    const config = this._configs.get(id);

    if (!data || !status) {
      console.warn(`[Rouse] Store "${id}" not found.`);
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
    manualConfig?: { url?: string; method?: string },
  ) {
    const store = this._getStore(id);
    if (!store) return;

    const { data, status, config } = store;
    const url = manualConfig?.url || config?.url;
    const defaultMethod = operation === 'save' ? 'POST' : 'GET';
    const storeMethod = operation === 'save' ? config?.saveMethod : config?.refreshMethod;
    const method = manualConfig?.method || storeMethod || defaultMethod;

    if (!url) {
      console.warn(`[Rouse] Cannot ${operation} store "${id}": No URL configured.`);
      return;
    }

    // Unique token for this specific network request
    const reqToken = Symbol();
    this._activeReqs.set(id, reqToken);

    // Snaphot used to diff the server and client state
    const snapshot = clone(data);
    status.loading = true;
    status.error = null;

    try {
      const result = await request(
        url,
        {
          method,
          ...(operation === 'save' && { body: data }),
          abortKey: `${operation}_${id}`,
        },
        this.appConfig,
      );

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
  }

  // PUBLIC API

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
  }

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
      console.error(`[Rouse] Invalid JSON in '${name}'. Store not initialized.`);
      return;
    }

    if (this._data.has(name)) {
      replaceState(this._data.get(name), newJson);
      this._initial.set(name, clone(newJson));
    } else {
      this._register(name, newJson);
    }
  }

  get<T = any>(name: string): T | undefined {
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
      console.warn(`[Rouse] Cannot configure '${name}'. Store not found.`);
      return;
    }
    this._setConfig(name, config);
  }

  async save(name: string, config?: { url?: string; method?: string }): Promise<void> {
    return this._request(name, 'save', config);
  }

  async refresh(name: string, config?: { url?: string; method?: string }): Promise<void> {
    return this._request(name, 'refresh', config);
  }

  reset(name: string) {
    const data = this._data.get(name);
    const initial = this._initial.get(name);
    if (!data) {
      return console.warn(`[Rouse] Cannot reset store "${name}": Store not found.`);
    }
    if (!initial) {
      return console.warn(
        `[Rouse] Cannot reset store "${name}": No initial state cached.`,
      );
    }
    replaceState(data, clone(initial));
  }

  remove(name: string) {
    this._data.delete(name);
    this._status.delete(name);
    this._configs.delete(name);
    this._initial.delete(name);
    this._activeReqs.delete(name);
  }
}
