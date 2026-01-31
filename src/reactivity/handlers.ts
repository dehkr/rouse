import { signal, trigger } from './';
import { methodIntercepts } from './arrays';
import { getRaw, proxiable, RAW, reactive } from './reactive';

export const ITERATION_KEY = Symbol('rz_iteration');
const signalCache = new WeakMap<object, Map<string | symbol, any>>();

/**
 * Gets the signal associated with a specific property on a target object.
 * If the signal doesn't exist in the cache, it's created lazily.
 *
 * @param target - The original raw object holding the property.
 * @param key - The property key (string or symbol) to retrieve the signal for.
 * @returns The signal instance for the requested property.
 */
export function getSignal(target: object, key: string | symbol) {
  let props = signalCache.get(target);
  if (!props) {
    props = new Map();
    signalCache.set(target, props);
  }
  let sig = props.get(key);
  if (!sig) {
    sig = signal(Reflect.get(target, key));
    props.set(key, sig);
  }
  return sig;
}

export const handlers: ProxyHandler<object> = {
  get(target: object, key: string | symbol, receiver: object): any {
    if (key === RAW || key === '__proto__') return target;

    if (Array.isArray(target) && Object.hasOwn(methodIntercepts, key)) {
      return Reflect.get(methodIntercepts, key, receiver);
    }

    const value = getSignal(target, key)();

    // Lazy deep reactivity
    if (proxiable(value)) return reactive(value);

    return value;
  },

  set(
    target: Record<string | symbol, unknown>,
    key: string | symbol,
    value: unknown,
    receiver: object,
  ): boolean {
    let oldValue = target[key];
    value = getRaw(value);

    const result = Reflect.set(target, key, value, receiver);

    if (value !== oldValue) {
      const sig = getSignal(target, key);
      
      // If the value actually changed (reference change), set it
      // If it's the same object (mutation), use trigger
      value !== sig() ? sig(value) : trigger(sig);

      // Trigger the iteration key
      if (Array.isArray(target)) {
        trigger(getSignal(target, ITERATION_KEY));
      }
    }
    return result;
  },

  ownKeys(target: Record<string | symbol, unknown>): (string | symbol)[] {
    const sig = getSignal(target, Array.isArray(target) ? 'length' : ITERATION_KEY);
    sig();
    return Reflect.ownKeys(target);
  },

  deleteProperty(target, key) {
    const hadKey = Object.hasOwn(target, key);
    const result = Reflect.deleteProperty(target, key);

    // Trigger if the key actually existed and was deleted
    if (result && hadKey) {
      getSignal(target, key)(undefined);
      trigger(getSignal(target, ITERATION_KEY));
    }
    return result;
  },

  has(target, key) {
    // Register dependency. Even if the key doesn't exist, we track
    // the signal so we get notified when added later.
    getSignal(target, key)();
    return Reflect.has(target, key);
  },
};
