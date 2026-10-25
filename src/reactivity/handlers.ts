import { computed, signal, trigger } from 'alien-signals';
import { methodIntercepts } from './arrays';
import {
  dirtyTrackers,
  getRaw,
  objectRootKeys,
  proxiable,
  reactive,
  untracked,
} from './reactive';

export const ITERATION_KEY = Symbol(__DEV__ ? 'rz.iteration' : '');

const signalCache = new WeakMap<object, Map<string | symbol, any>>();
const computedCache = new WeakMap<object, Map<string | symbol, () => any>>();

export const handlers: ProxyHandler<object> = {
  get(target: object, key: string | symbol, receiver: object): any {
    if (key === '__proto__') return target;

    if (Array.isArray(target) && Object.hasOwn(methodIntercepts, key)) {
      return Reflect.get(methodIntercepts, key, receiver);
    }

    // Accessor: wrap getters in `computed` so reads track deps and
    // re-evaluate when those deps change.
    const desc = Object.getOwnPropertyDescriptor(target, key);
    if (desc?.get) {
      const comp = getComputed(target, key, desc.get, receiver)();
      return reactive(comp);
    }

    const value = getSignal(target, key)();

    // Lazy deep reactivity
    if (proxiable(value)) {
      const parentTracker = dirtyTrackers.get(target);
      if (parentTracker) {
        propagateTracker(target, key, value, parentTracker, desc);
      }
      return reactive(value);
    }
    return value;
  },

  set(
    target: Record<string | symbol, unknown>,
    key: string | symbol,
    value: unknown,
    receiver: object,
  ): boolean {
    // Accessor: delegate to the setter if defined. Otherwise `Reflect.set`
    // returns `false` which would cause the write to throw in JS strict mode.
    const desc = Object.getOwnPropertyDescriptor(target, key);
    if (desc?.get || desc?.set) {
      return Reflect.set(target, key, value, receiver);
    }

    const hadKey = Object.hasOwn(target, key);
    const oldValue = target[key];

    value = getRaw(value);

    const result = Reflect.set(target, key, value, receiver);

    if (value !== oldValue) {
      const sig = getSignal(target, key);

      // If the value actually changed (reference change), set it. If it's the same
      // object (mutation), use trigger. Reading untracked keeps a writing effect from
      // subscribing to the key it writes, which would wake it on unrelated writes.
      value !== untracked(sig) ? sig(value) : trigger(sig);

      const tracker = dirtyTrackers.get(target);
      if (tracker) {
        tracker(getRootKey(target, key));
        // Propagate the tracker to the newly-assigned object
        if (proxiable(value)) {
          propagateTracker(target, key, value, tracker, desc);
        }
      }

      // Trigger the iteration on structural changes (new keys or any array mutation)
      if (!hadKey || Array.isArray(target)) {
        trigger(getSignal(target, ITERATION_KEY));
      }
    }
    return result;
  },

  ownKeys(target: Record<string | symbol, unknown>): (string | symbol)[] {
    getSignal(target, Array.isArray(target) ? 'length' : ITERATION_KEY)();
    return Reflect.ownKeys(target);
  },

  deleteProperty(target, key) {
    const hadKey = Object.hasOwn(target, key);
    const result = Reflect.deleteProperty(target, key);

    // Trigger if the key actually existed and was deleted
    if (result && hadKey) {
      getSignal(target, key)(undefined);
      trigger(getSignal(target, ITERATION_KEY));

      const tracker = dirtyTrackers.get(target);
      if (tracker) {
        tracker(getRootKey(target, key));
      }
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

/**
 * Returns the signal associated with a specific property on a target object.
 * If the signal doesn't exist in the cache, it's created lazily.
 */
export function getSignal(target: object, key: string | symbol) {
  const props = propsOf(signalCache, target);
  let sig = props.get(key);
  if (!sig) {
    sig = signal(Reflect.get(target, key));
    props.set(key, sig);
  }
  return sig;
}

/**
 * Returns the computed associated with an accessor property on `target`.
 * Created lazily and bound to `receiver` so `this` inside the getter
 * resolves to the proxy and reads track through it.
 */
function getComputed(
  target: object,
  key: string | symbol,
  getter: () => any,
  receiver: object,
) {
  const props = propsOf(computedCache, target);
  let comp = props.get(key);
  if (!comp) {
    comp = computed(() => getter.call(receiver));
    props.set(key, comp);
  }
  return comp;
}

/** Returns `target`'s per-key map in `cache`, creating it on first use. */
function propsOf<V>(
  cache: WeakMap<object, Map<string | symbol, V>>,
  target: object,
): Map<string | symbol, V> {
  let props = cache.get(target);
  if (!props) {
    props = new Map();
    cache.set(target, props);
  }
  return props;
}

/**
 * Hands `tracker` to the object stored at `key`, so edits inside it report the same
 * root. Skips an object that already has one, and a non-enumerable key.
 */
function propagateTracker(
  target: object,
  key: string | symbol,
  child: object,
  tracker: (rootKey: string) => void,
  desc: PropertyDescriptor | undefined,
) {
  const rawChild = getRaw(child);
  if (!dirtyTrackers.has(rawChild) && desc?.enumerable !== false) {
    dirtyTrackers.set(rawChild, tracker);
    objectRootKeys.set(rawChild, getRootKey(target, key));
  }
}

function getRootKey(target: object, key: string | symbol) {
  return objectRootKeys.get(target) ?? String(key);
}
