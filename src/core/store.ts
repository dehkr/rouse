import { getStoreName } from '../directives';
import { request } from '../net/request';
import { reactive } from '../reactivity';

export interface StoreStatus {
  loading: boolean;
  error: string | null;
  lastSync: number;
}

export interface SyncConfig {
  method: string;
  url: string;
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
 * Safely deep-clones an object and strips any functions.
 */
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
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
    const existing = this._configs.get(id) || { method: 'POST', url: '' };
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
    const url = manualConfig?.url || config?.url;
    const defaultMethod = operation === 'save' ? 'POST' : 'GET';
    const method = manualConfig?.method || config?.method || defaultMethod;

    if (!url) {
      console.warn(`[Rouse] Cannot ${operation} store "${id}": No URL configured.`);
      return;
    }

    // Generate a unique token for this network request
    const reqToken = Symbol();
    this._activeReqs.set(id, reqToken);

    const snapshot = operation === 'save' ? clone(data) : null;
    status.loading = true;
    status.error = null;

    try {
      const result = await request(url, {
        method,
        ...(operation === 'save' && { body: data }),
        abortKey: `${operation}_${id}`,
      });

      if (result.error) {
        if (result.error.status === 'CANCELED') {
          return;
        }
        throw result.error;
      }

      if (result.data && typeof result.data === 'object') {
        replaceState(data, result.data);

        if (operation === 'refresh') {
          this._initial.set(id, clone(result.data));
        }
      }
      status.lastSync = Date.now();
    } catch (error: any) {
      if (operation === 'save' && snapshot) {
        replaceState(data, snapshot);
      }
      status.error = error.message || `${operation} failed`;
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
      replaceState(this._data.get(name)!, state);
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

    let newJson;
    try {
      newJson = JSON.parse(el.textContent || '{}');
    } catch (e) {
      console.error(`[Rouse] Invalid JSON in "${name}". Store not initialized.`);
      return;
    }

    if (this._data.has(name)) {
      replaceState(this._data.get(name)!, newJson);
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
