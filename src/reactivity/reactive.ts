import { handlers, readOnlyHandlers } from './handlers';

const proxyCache = new WeakMap();
const rawCache = new WeakMap();
const readOnlyCache = new WeakMap();

export const dirtyTrackers = new WeakMap<object, (rootKey: string) => void>();
export const objectRootKeys = new WeakMap<object, string>();

export const RAW: unique symbol = Symbol('rz_raw');
export const READONLY: unique symbol = Symbol('rz_readonly');

export type ReactiveProxy<T> = T;

/**
 * Creates a reactive proxy for the target object.
 *
 * - If passed a raw object, it returns its reactive proxy (creating one if needed).
 * - If passed an existing proxy, it returns it as-is.
 * - If passed a non-proxiable value (primitive, DOM node, flagged), it returns it as-is.
 *
 * The returned proxy is deeply reactive but lazy: nested properties are converted to
 * proxies only when accessed.
 *
 * @template T - The type of the target object.
 * @param target - The object to make reactive.
 * @returns The reactive proxy, or the original value if it cannot be proxied.
 *
 * @example
 * const state = reactive({ count: 0 });
 * effect(() => console.log(state.count));
 */
export function reactive<T extends object>(target: T): ReactiveProxy<T> {
  if (!proxiable(target)) return target;
  if ((target as any)[RAW]) return target;
  if ((target as any)[READONLY]) return target;
  if (rawCache.has(target)) return target;
  if (proxyCache.has(target)) return proxyCache.get(target);

  const proxy = new Proxy(target, handlers as ProxyHandler<any>);

  proxyCache.set(target, proxy);
  rawCache.set(proxy, target);

  return proxy as ReactiveProxy<T>;
}

/** Makes sure the target is eligible to be a proxy. */
export function proxiable(target: unknown): target is object {
  if (target === null || typeof target !== 'object') return false;
  if (Array.isArray(target)) return true;

  return Object.prototype.toString.call(target) === '[object Object]';
}

/** Creates a reactive proxy for an eligible object. */
export function createProxy<T>(target: T): T {
  return proxiable(target) ? reactive(target) : target;
}

/** Check if a value is a proxy. */
export function isProxy(target: unknown): target is ReactiveProxy<typeof target> {
  return Boolean(proxiable(target) && rawCache.has(target));
}

/** Returns the proxy of an object if found, else original. */
export function getProxy<T>(target: T): T {
  return (proxyCache.get(target as object) as T) || target;
}

/** Returns the original raw object of a proxy. */
export function getRaw<T>(target: T): T {
  const raw = rawCache.get(target as object);
  return raw ? (getRaw(raw) as T) : target;
}

/** Flags value with `RAW` to prevent it from becoming reactive. */
export function nonReactive<T extends object>(target: T): T {
  if ((target as any)[READONLY]) return target;
  if (Object.hasOwn(target, RAW)) return target;

  if (Object.isExtensible(target)) {
    Object.defineProperty(target, RAW, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  }

  return target;
}

/** Wraps an object in a deep, immutable proxy. */
export function readOnly<T extends object>(target: T): T {
  if (!proxiable(target)) return target;
  if ((target as any)[READONLY]) return target;
  if (readOnlyCache.has(target)) return readOnlyCache.get(target);

  const proxy = new Proxy(target, readOnlyHandlers);
  readOnlyCache.set(target, proxy);

  return proxy as T;
}

/** Registers a callback to track mutations back to their root property. */
export function trackDirty<T extends object>(
  target: T,
  callback: (rootKey: string) => void,
) {
  const raw = getRaw(target);
  if (raw) {
    dirtyTrackers.set(raw, callback);
  }
}
