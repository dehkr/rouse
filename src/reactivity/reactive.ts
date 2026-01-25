import { handlers } from './handlers';

const proxyCache = new WeakMap();
const rawCache = new WeakMap();

export declare const KeepRaw: unique symbol;

export const flag = {
  RAW: Symbol('gn_raw'),
  SKIP: Symbol('gn_skip'),
} as const;

export type Target = {
  [flag.RAW]?: any;
  [flag.SKIP]?: boolean;
};

export type RawObject<T> = T & { [KeepRaw]?: true };
export type ReactiveProxy<T> = T;

/** Makes sure a value is eligible to be a proxy. */
export function proxiable(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  // Make sure it's a plain object
  return Object.prototype.toString.call(value) === '[object Object]';
}

/** Checks for any flags indicating target should not be proxied. */
export function flagged(target: any): target is Target {
  return !!(target && (target[flag.SKIP] || target[flag.RAW]));
}

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
  if (flagged(target)) return target;
  if (rawCache.has(target)) return target;
  if (proxyCache.has(target)) return proxyCache.get(target);

  const proxy = new Proxy(target, handlers as ProxyHandler<any>);

  proxyCache.set(target, proxy);
  rawCache.set(proxy, target);

  return proxy as ReactiveProxy<T>;
}

/**
 * Flags an object with `SKIP` to prevent it from being proxied.
 * Returns the object itself.
 * @param value - The object to be flagged.
 */
export function keepRaw<T extends object>(value: T): RawObject<T> {
  if (!Object.hasOwn(value, flag.SKIP) && Object.isExtensible(value)) {
    Object.defineProperty(value, flag.SKIP, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: true,
    });
  }
  return value;
}

/** Creates a reactive proxy for an eligible object. */
export function createProxy<T>(value: T): T {
  return proxiable(value) ? reactive(value) : value;
}

/** Check if a value is a proxy. */
export function isProxy(value: unknown): value is ReactiveProxy<typeof value> {
  return !!(proxiable(value) && rawCache.has(value));
}

/** Returns the proxy of an object if found, else original. */
export function getProxy<T>(object: T): T {
  return (proxyCache.get(object as object) as T) || object;
}

/** Returns the original raw object of a proxy. */
export function getRaw<T>(proxy: T): T {
  const raw = rawCache.get(proxy as object);
  return raw ? (getRaw(raw) as T) : proxy;
}
