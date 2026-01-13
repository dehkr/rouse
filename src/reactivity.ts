import { isObj } from './utils';

let activeEffect: ReactiveEffect | null = null;

const proxyMap = new WeakMap<object, any>();
const targetMap = new WeakMap<object, Map<string | symbol, Set<ReactiveEffect>>>();
const IS_REACTIVE = Symbol('is_reactive');
const ITERATE_KEY = Symbol('iterate_key');

interface ReactiveEffect {
  (): void;
  active: boolean;
  deps: Set<ReactiveEffect>[];
}

/**
 * Creates a reactive proxy of the source object.
 *
 * @param target - The plain object to make reactive.
 * @returns A reactive Proxy of the target.
 * @note Always interact with the returned Proxy, not the original target object,
 * to ensure reactivity is maintained.
 */
export function reactive<T extends object>(target: T): T {
  if (!isObj(target)) return target;
  if ((target as any)[IS_REACTIVE]) return target; // Prevent double-wrapping
  if (proxyMap.has(target)) return proxyMap.get(target); // Raw object

  const handler: ProxyHandler<T> = {
    get(target, key, receiver) {
      if (key === IS_REACTIVE) return true; // Intercept the flag check
      const result = Reflect.get(target, key, receiver);
      track(target, key);

      return isObj(result) ? reactive(result) : result; // Lazy deep reactivity
    },

    ownKeys(target) {
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
      return Reflect.ownKeys(target);
    },

    set(target, key, value, receiver) {
      const oldValue = Reflect.get(target, key, receiver);

      // Determine if this is a new property/index or an existing one
      const isArrIndex = Array.isArray(target) && typeof key === 'string' && !isNaN(Number(key));
      const hadKey = isArrIndex ? Number(key) < target.length : Object.hasOwn(target, key);

      const result = Reflect.set(target, key, value, receiver);

      // Only trigger if the value changed
      if (oldValue !== value) {
        trigger(target, key);
        // If it was an addition, trigger structural dependencies
        if (!hadKey) {
          trigger(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
        }
      }
      return result;
    },

    deleteProperty(target, key) {
      const hadKey = Object.hasOwn(target, key);
      const result = Reflect.deleteProperty(target, key);
      // If delete was successful, trigger structural updates
      if (result && hadKey) {
        trigger(target, key);
        trigger(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
      }
      return result;
    },
  };

  const proxy = new Proxy(target, handler);
  proxyMap.set(target, proxy);

  return proxy;
}

/**
 * Runs a function immediately and re-runs it whenever its reactive dependencies change.
 *
 * @param fn The function to execute and track.
 * @returns A stop function that marks the effect as inactive to prevent further runs.
 */
export function effect(fn: () => void): () => void {
  const run: ReactiveEffect = (() => {
    // Don't run if the effect has been stopped
    if (run.active === false) return;

    try {
      activeEffect = run;
      fn();
    } finally {
      activeEffect = null;
    }
  }) as any;

  run.active = true;

  // Run immediately to capture initial dependencies
  run();

  // Returns the "stop" function.
  // Uses lazy cleanup: the runner is flagged instead of searching the dependency tree.
  // TODO: consider adding active cleanup
  return () => {
    run.active = false;
  };
}

/**
 * Records the current activeEffect as a dependency of (target, key).
 */
function track(target: object, key: string | symbol) {
  if (!activeEffect) return;
  // Skip tracking if the effect was stopped
  if ((activeEffect as any).active === false) return;

  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }

  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }

  dep.add(activeEffect);
}

/**
 * Runs all effects that depend on (target, key).
 */
function trigger(target: object, key: string | symbol) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  const dep = depsMap.get(key);
  if (dep) {
    // Clone the Set to avoid infinite loops if an effect mutates the dependency it's reading
    const effectsToRun = new Set(dep);
    effectsToRun.forEach((effectFn) => {
      // Don't run if stopped or if it's the current effect (to prevent recursive loops)
      if (effectFn !== activeEffect && (effectFn as any).active !== false) {
        effectFn();
      } else if ((effectFn as any).active === false) {
        // Clean up dead effects
        dep.delete(effectFn);
      }
    });

    // If the Set is now empty, remove the key to save memory
    if (dep.size === 0) {
      depsMap.delete(key);
    }
  }
}
