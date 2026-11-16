import { setActiveSub } from 'alien-signals';
import { warn } from '../core/diagnostics';
import { handlers } from './handlers';
import { type PersistOptions, resolvePersist, restore, startSaving } from './persist';

export type { PersistStorage } from './persist';

/** Options for `reactive()`. */
export type ReactiveOptions = PersistOptions;

const proxyCache = new WeakMap();
const rawCache = new WeakMap();

export const dirtyTrackers = new WeakMap<object, (rootKey: string) => void>();
export const objectRootKeys = new WeakMap<object, string>();

/**
 * Creates a reactive proxy for the target object.
 *
 * - If passed a raw object, it returns its reactive proxy (creating one if needed).
 * - If passed an existing proxy, it returns it as-is.
 * - If passed anything but a plain object or array (primitive, class instance,
 *   built-in such as `Map` or `Date`), it returns it as-is.
 *
 * The returned proxy is deeply reactive but lazy: nested properties are converted to
 * proxies only when accessed.
 *
 * **Persistence:** pass `persist` and `persistKey` to keep the state across page loads.
 * - The saved value is restored before the proxy is created. An object takes each saved
 *   field over its initial value, skipping getters and methods. An array is replaced.
 * - Every change saves the data fields as JSON. Getters and methods are never saved.
 * - Unreadable storage or a saved value of another type keeps the initial value.
 * - Saving stops with the scope when called during setup or `connect()`. Otherwise
 *   it runs for the page's lifetime.
 *
 * @template T - The type of the target object.
 * @param target - The object to make reactive.
 * @param options - `persist` (`'local'` or `'session'`) with a `persistKey` used verbatim
 *   as the storage key. Options apply only on the object's first `reactive()` call.
 * @returns The reactive proxy, or the original value if it cannot be proxied.
 * @throws If `persist` is not `'local'` or `'session'`, or `persistKey` is missing.
 *
 * @example
 * const state = reactive({ count: 0 });
 * effect(() => console.log(state.count));
 *
 * @example
 * const prefs = reactive({ theme: 'light' }, { persist: 'local', persistKey: 'prefs' });
 */
export function reactive<T extends object>(target: T, options?: ReactiveOptions): T {
  // Internal callers create nested proxies without options, so they skip this branch
  if (options) return reactiveWithOptions(target, options);
  if (!proxiable(target)) return target;
  if (rawCache.has(target)) return target;
  if (proxyCache.has(target)) return proxyCache.get(target);

  const proxy = new Proxy(target, handlers as ProxyHandler<any>);

  proxyCache.set(target, proxy);
  rawCache.set(proxy, target);

  return proxy as T;
}

/** Applies `reactive()`'s options; the proxy is created only after restoring. */
function reactiveWithOptions<T extends object>(target: T, options: ReactiveOptions): T {
  const persisted = resolvePersist(options);
  if (!persisted) return reactive(target);

  if (!proxiable(target) || rawCache.has(target) || proxyCache.has(target)) {
    if (__DEV__) {
      warn(
        `Cannot persist '${persisted.key}': pass a plain object or array that isn't already reactive.`,
      );
    }
    return reactive(target);
  }

  restore(target, persisted);
  const proxy = reactive(target);
  startSaving(proxy, persisted);

  return proxy;
}

/**
 * Accepts arrays and plain objects only. Matches `isPlainObject` in `core/state`.
 */
export function proxiable(target: unknown): target is object {
  if (target === null || typeof target !== 'object') return false;
  if (Array.isArray(target)) return true;

  // Class instances keep their own prototype; proxying them breaks private fields.
  const proto = Object.getPrototypeOf(target);
  return proto === Object.prototype || proto === null;
}

/**
 * Returns the original raw object of a proxy.
 */
export function getRaw<T>(target: T): T {
  const raw = rawCache.get(target as object);
  return raw ? (getRaw(raw) as T) : target;
}

/**
 * Registers a callback to track mutations back to their root property.
 */
export function trackDirty<T extends object>(
  target: T,
  callback: (rootKey: string) => void,
) {
  dirtyTrackers.set(getRaw(target), callback);
}

/**
 * Read every enumerable key through the proxy to fire the get trap.
 */
export function seedPropagation(obj: any, seen = new WeakSet()): void {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
  seen.add(obj);
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    seedPropagation(value, seen);
  }
}

/**
 * Runs `fn` without linking the reads or any effects created inside it to the
 * current tracking context. Used by `rz-render` so per-instance directive
 * effects survive the parent render effect re-running (and don't leak into it).
 */
export function untracked<T>(fn: () => T): T {
  const prev = setActiveSub(undefined);
  try {
    return fn();
  } finally {
    setActiveSub(prev);
  }
}
