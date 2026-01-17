import { isObj } from './utils';
import { IS_REACTIVE } from './effect';
import { createBaseHandlers, createCollectionHandlers } from './handlers';

export type Reactive<T> = T;

const proxyMap = new WeakMap<object, any>();
const baseHandlers = createBaseHandlers(reactive);
const collectionHandlers = createCollectionHandlers(reactive);

function getTargetType(value: object): 'COLLECTION' | 'COMMON' {
  return value instanceof Map ||
    value instanceof Set ||
    value instanceof WeakMap ||
    value instanceof WeakSet
    ? 'COLLECTION'
    : 'COMMON';
}

/**
 * Creates a reactive proxy of the source object.
 *
 * @param target The plain object to make reactive.
 * @returns A reactive Proxy of the target.
 * @note Always interact with the returned Proxy, not the original target object,
 * to ensure reactivity is maintained.
 */
export function reactive<T extends object>(target: T): Reactive<T> {
  if (!isObj(target)) return target;
  // Prevent double wrapping
  if ((target as any)[IS_REACTIVE]) return target;
  // Return proxy if object is already in map
  if (proxyMap.has(target)) return proxyMap.get(target);

  const targetType = getTargetType(target);
  const handler = targetType === 'COLLECTION' ? collectionHandlers : baseHandlers;

  const proxy = new Proxy(target, handler);
  proxyMap.set(target, proxy);
  return proxy as Reactive<T>;
}
