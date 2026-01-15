import { isObj } from './utils';

let activeEffect: ReactiveEffect | null = null;
const effectStack: ReactiveEffect[] = [];

const proxyMap = new WeakMap<object, any>();
const targetMap = new WeakMap<object, Map<string | symbol, Set<ReactiveEffect>>>();
const IS_REACTIVE = Symbol('is_reactive');
const ITERATE_KEY = Symbol('iterate_key');

let isFlushPending = false;
const queue = new Set<ReactiveEffect>();
const p = Promise.resolve();

interface ReactiveEffect {
  (): void;
  active: boolean;
  deps: Set<ReactiveEffect>[];
  options?: { scheduler?: (job: ReactiveEffect) => void };
}

// Batch updates to avoid duplicate runs and loops
function queueJob(job: ReactiveEffect) {
  if (!queue.has(job)) {
    queue.add(job);
    queueFlush();
  }
}

function queueFlush() {
  if (isFlushPending) return;
  isFlushPending = true;
  p.then(flushJobs);
}

function flushJobs() {
  isFlushPending = false;
  queue.forEach((job) => {
    if (job.active) job();
  });
  queue.clear();
}

// Identify types that require 'this' binding
function isBuiltIn(val: unknown): boolean {
  return (
    val instanceof Map ||
    val instanceof Set ||
    val instanceof WeakMap ||
    val instanceof WeakSet ||
    val instanceof Date ||
    val instanceof Promise
  );
}

/**
 * Creates a reactive proxy of the source object.
 *
 * @param target The plain object to make reactive.
 * @returns A reactive Proxy of the target.
 * @note Always interact with the returned Proxy, not the original target object,
 * to ensure reactivity is maintained.
 */
export function reactive<T extends object>(target: T): T {
  if (!isObj(target)) return target;
  // Prevent double wrapping
  if ((target as any)[IS_REACTIVE]) return target;
  // Return proxy if object is already in map
  if (proxyMap.has(target)) return proxyMap.get(target);

  const handler: ProxyHandler<T> = {
    get(target, key, receiver) {
      if (key === IS_REACTIVE) return true;

      const result = Reflect.get(target, key, receiver);
      // Native objects can throw errors when their methods are called on a Proxy
      if (typeof result === 'function' && isBuiltIn(target)) {
        return result.bind(target);
      }
      track(target, key);
      // Lazy deep reactivity
      return isObj(result) ? reactive(result) : result;
    },

    ownKeys(target) {
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY);
      return Reflect.ownKeys(target);
    },

    set(target, key, value, receiver) {
      const oldValue = Reflect.get(target, key, receiver);

      // Determine if this is a new property/index or an existing one
      const isArrIndex =
        Array.isArray(target) && typeof key === 'string' && !Number.isNaN(Number(key));
      const hadKey = isArrIndex ? Number(key) < target.length : Object.hasOwn(target, key);

      const result = Reflect.set(target, key, value, receiver);

      // Only trigger if the value changed
      if (oldValue !== value) {
        trigger(target, key);
        // If it was an addition, trigger structural updates
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
    if (!run.active) return;
    cleanup(run);

    try {
      effectStack.push(run);
      activeEffect = run;
      fn();
    } finally {
      effectStack.pop();
      activeEffect = effectStack[effectStack.length - 1];
    }
  }) as any;

  run.active = true;
  run.deps = [];
  run.options = { scheduler: queueJob };

  // Run immediately to capture initial dependencies
  run();

  // Returns a stop function
  return () => {
    run.active = false;
    cleanup(run);
  };
}

/**
 * Deletes all dependencies of an effect.
 */
function cleanup(effect: ReactiveEffect) {
  const { deps } = effect;
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect);
    }
    deps.length = 0;
  }
}

/**
 * Records the current activeEffect as a dependency of (target, key).
 */
function track(target: object, key: string | symbol) {
  if (!activeEffect) return;

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

  // Link effect to dep and dep to effect
  if (!dep.has(activeEffect)) {
    dep.add(activeEffect);
    activeEffect.deps.push(dep);
  }
}

/**
 * Runs all effects that depend on (target, key).
 */
function trigger(target: object, key: string | symbol) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  const effectsToRun = new Set<ReactiveEffect>();
  const add = (effects: Set<ReactiveEffect> | undefined) => {
    if (effects) {
      effects.forEach((effect) => {
        // Don't trigger current effect to prevent infinite recursion
        if (effect !== activeEffect || !effect.options?.scheduler) {
          effectsToRun.add(effect);
        }
      });
    }
  };

  if (key !== undefined) {
    add(depsMap.get(key));
  }

  effectsToRun.forEach((effect) => {
    if (effect.options?.scheduler) {
      effect.options.scheduler(effect);
    } else {
      effect();
    }
  });
}
