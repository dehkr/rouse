import { endBatch, setActiveSub, startBatch } from 'alien-signals';
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
  const persisted = options && resolvePersist(options);

  if (!proxiable(target) || rawCache.has(target) || proxyCache.has(target)) {
    if (__DEV__ && persisted) {
      warn(
        `Cannot persist '${persisted.key}': pass a plain object or array that isn't already reactive.`,
      );
    }
    return proxyCache.get(target) ?? target;
  }

  // Restore before the proxy exists, so restoring triggers no effects
  if (persisted) restore(target, persisted);

  const proxy = new Proxy(target, handlers as ProxyHandler<any>);

  proxyCache.set(target, proxy);
  rawCache.set(proxy, target);

  if (persisted) startSaving(proxy, persisted);

  return proxy as T;
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

// Only the synchronous part of `fn` is batched. Don't add a scheduler or microtask
// queue to stretch a batch across an `await`: writes outside `batch()` must update
// the DOM before the next statement runs.
/**
 * Runs `fn` and defers effects until it returns, so each effect runs at most once
 * for all the writes inside it. Returns `fn`'s result.
 *
 * - Reads inside `fn`, including computed values, return current state. Only effects
 *   wait, so the DOM updates when the outermost `batch()` returns.
 * - Nested calls run their effects once, when the outermost call returns.
 * - If `fn` throws, effects for the writes before the throw still run, and the error
 *   propagates.
 * - Writes after an `await` inside `fn` are not batched.
 *
 * @param fn - A synchronous function that writes state.
 */
export function batch<T>(fn: () => T): T {
  startBatch();
  try {
    const result = fn();
    if (__DEV__ && typeof (result as { then?: unknown } | null)?.then === 'function') {
      warn(
        `batch() callback returned a promise. Writes after its first 'await' run unbatched. Wrap only synchronous updates inside batch().`,
      );
    }
    return result;
  } finally {
    endBatch();
  }
}
