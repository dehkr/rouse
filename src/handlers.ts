import {
  IS_REACTIVE,
  ITERATE_KEY,
  pauseTracking,
  resetTracking,
  track,
  trigger,
  RAW,
} from './effect';
import { isObj } from './utils';

// ARRAY INSTRUMENTATION

const arrayInstrumentations: Record<string, Function> = {};

['push', 'pop', 'shift', 'unshift', 'splice'].forEach((key) => {
  arrayInstrumentations[key] = function (this: unknown[], ...args: unknown[]) {
    const target = (this as any)[RAW];

    // Pause tracking before running method on target array to prevent
    // unnecessary triggers while array goes through steps of mutating
    pauseTracking();
    const result = (target as any)[key].apply(target, args);
    resetTracking();

    trigger(target, 'length');

    return result;
  };
});

// BASE HANDLERS

type ReactiveFn = <T extends object>(target: T) => T;

/**
 * Standard handlers for plain Objects and Arrays.
 * Relies on Reflect to ensure proper 'this' binding for getters/setters.
 */
export function createBaseHandlers(reactive: ReactiveFn): ProxyHandler<object> {
  return {
    get(target, key, receiver) {
      if (key === IS_REACTIVE) return true;
      if (key === RAW) return target;

      // Intercept array mutators
      if (Array.isArray(target) && Object.hasOwn(arrayInstrumentations, key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }

      const result = Reflect.get(target, key, receiver);

      // Track standard keys
      if (typeof key !== 'symbol') {
        track(target, key);
      }

      // Lazy deep reactivity
      return isObj(result) ? reactive(result) : result;
    },

    set(target, key, value, receiver) {
      const oldVal = (target as any)[key];
      const result = Reflect.set(target, key, value, receiver);

      if (result && oldVal !== value) {
        trigger(target, key, value, oldVal);

        // Detects if setter is adding new index via direct assignment (arr[5] = 'apple')
        const isArrayIndex =
          Array.isArray(target) && Number.isInteger(Number(key)) && Number(key) >= target.length;

        // If adding new key in array or object, notify watchers of length prop or iterators
        if (isArrayIndex || !Object.hasOwn(target, key)) {
          trigger(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
        }
      }
      return result;
    },

    deleteProperty(target, key) {
      const hadKey = Object.hasOwn(target, key);
      const result = Reflect.deleteProperty(target, key);

      if (result && hadKey) {
        trigger(target, key, undefined, undefined);
        trigger(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
      }
      return result;
    },

    ownKeys(target) {
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
      return Reflect.ownKeys(target);
    },
  };
}

// COLLECTION HANDLERS

/**
 * Custom instrumentations for Map/Set/WeakMap/WeakSet.
 * Required because Proxy traps don't work on internal methods of these native types.
 */
export function createCollectionHandlers(reactive: ReactiveFn): ProxyHandler<object> {
  const collectionInst: Record<string, Function> = {
    get(this: Map<any, any>, key: unknown) {
      const target = (this as any)[RAW];
      const res = target.get(key);
      track(target, key as string);
      return isObj(res) ? reactive(res) : res;
    },

    get size() {
      const target = (this as any)[RAW];
      track(target, ITERATE_KEY);
      return Reflect.get(target, 'size', target);
    },

    has(this: Map<any, any>, key: unknown) {
      const target = (this as any)[RAW];
      const res = target.has(key);
      track(target, key as string);
      return res;
    },

    set(this: Map<any, any>, key: unknown, value: unknown) {
      const target = (this as any)[RAW];
      const oldVal = target.get(key);
      const hadKey = target.has(key);
      const res = target.set(key, value);

      if (!hadKey || value !== oldVal) {
        trigger(target, key as string, value, oldVal);
        if (!hadKey) trigger(target, ITERATE_KEY); // Size changed
      }
      return res;
    },

    add(this: Set<any>, value: unknown) {
      const target = (this as any)[RAW];
      const hadKey = target.has(value);
      const res = target.add(value);
      if (!hadKey) {
        trigger(target, value as string, value, undefined);
        trigger(target, ITERATE_KEY);
      }
      return res;
    },

    delete(this: Map<any, any> | Set<any>, key: unknown) {
      const target = (this as any)[RAW];
      const hadKey = target.has(key);
      const res = target.delete(key);
      if (hadKey) {
        trigger(target, key as string, undefined, undefined);
        trigger(target, ITERATE_KEY);
      }
      return res;
    },

    clear(this: Map<any, any> | Set<any>) {
      const target = (this as any)[RAW];
      const hadItems = target.size > 0;
      const res = target.clear();
      if (hadItems) {
        trigger(target, ITERATE_KEY, undefined, undefined);
      }
      return res;
    },

    forEach(this: Map<any, any> | Set<any>, callback: Function, thisArg?: any) {
      const target = (this as any)[RAW];
      track(target, ITERATE_KEY);
      // Wrap callback so we pass reactive versions of values
      target.forEach((value: any, key: any) => {
        // For Sets, key is same as value
        const wrappedValue = isObj(value) ? reactive(value) : value;
        const wrappedKey = isObj(key) ? reactive(key) : key;
        callback.call(thisArg, wrappedValue, wrappedKey, this);
      });
    },
  };
  
  return {
    get(target, key, receiver) {
      if (key === IS_REACTIVE) return true;
      if (key === RAW) return target;

      // Return instrumented method if it exists (get, set, add, etc)
      if (Object.hasOwn(collectionInst, key)) {
        return Reflect.get(collectionInst, key, receiver);
      }

      // Handle 'size' specifically because it's a getter on the prototype
      if (key === 'size') {
        return Reflect.get(collectionInst, 'size', receiver);
      }

      // Fallback to standard props (e.g. toString)
      return Reflect.get(target, key, receiver);
    },
  };
}
