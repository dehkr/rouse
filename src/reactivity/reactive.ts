import { isObj, isCollection } from '../utils/is';
import { IS_REACTIVE } from './effect';
import { createBaseHandlers, createCollectionHandlers } from './handlers';

export type Reactive<T> = T;

const proxyMap = new WeakMap();
const baseHandlers = createBaseHandlers(reactive);
const collectionHandlers = createCollectionHandlers(reactive);

/**
 * Creates a reactive proxy of the source object.
 *
 * @param target The plain object to make reactive.
 * @returns A reactive Proxy of the target.
 * @note Always interact with the returned Proxy, not the original target object,
 * to ensure reactivity is maintained.
 */
export function reactive<T extends object>(target: T): Reactive<T> {
  if (!isObj(target) || (target as any)[IS_REACTIVE]) {
    return target;
  }
  if (proxyMap.has(target)) {
    return proxyMap.get(target);
  }
  const handler = isCollection(target) ? collectionHandlers : baseHandlers;
  const proxy = new Proxy(target, handler);

  proxyMap.set(target, proxy);

  return proxy as Reactive<T>;
}
