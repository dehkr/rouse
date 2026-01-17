import { isObj } from './utils';

// TYPES & INTERFACES

export const RAW = Symbol('raw');
const IS_REACTIVE = Symbol('is_reactive');
const ITERATE_KEY = Symbol('iterate_key');

type Dep = Set<ReactiveEffect>;
type KeyToDepMap = Map<string | symbol, Dep>;

export interface EffectOptions {
  scheduler?: (job: ReactiveEffect) => void;
  sync?: boolean;
}

export interface ReactiveEffect<T = any> {
  (): T;
  active: boolean;
  deps: Dep[];
  options: EffectOptions;
}

export type Reactive<T> = T;

// GLOBALS

let activeEffect: ReactiveEffect | null = null;
let shouldTrack = true;
const effectStack: ReactiveEffect[] = [];
const targetMap = new WeakMap<object, KeyToDepMap>();
const proxyMap = new WeakMap<object, any>();

// SCHEDULING

let isFlushPending = false;
const queue = new Set<ReactiveEffect>();
const p = Promise.resolve();

// Batch effect updates to avoid duplicate runs/loops and keep the UI correct
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

// BASE HANDLERS

const arrayInstrumentations: Record<string, Function> = {};

['push', 'pop', 'shift', 'unshift', 'splice'].forEach((key) => {
  arrayInstrumentations[key] = function (this: unknown[], ...args: unknown[]) {
    const target = (this as any)[RAW];

    // Pause tracking before running method on target array to prevent
    // unnecessary triggers while array goes through steps of mutating
    shouldTrack = false;
    const result = (target as any)[key].apply(target, args);
    shouldTrack = true;

    trigger(target, 'length');

    return result;
  };
});

/**
 * Standard handlers for plain Objects and Arrays.
 * Relies on Reflect to ensure proper 'this' binding for getters/setters.
 */
const baseHandlers: ProxyHandler<object> = {
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

// COLLECTION HANDLERS

/**
 * Custom instrumentations for Map/Set/WeakMap/WeakSet.
 * Required because Proxy traps don't work on internal methods of these native types.
 */
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

const collectionHandlers: ProxyHandler<object> = {
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

// REACTIVITY

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

// EFFECTS

/**
 * Runs a function immediately and re-runs it whenever its reactive dependencies change.
 *
 * @param fn The function to execute and track.
 * @returns A stop function that marks the effect as inactive to prevent further runs.
 */
export function effect<T = any>(fn: () => void, options: EffectOptions = {}): () => void {
  const run = (() => {
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
  }) as ReactiveEffect<T>;

  run.active = true;
  run.deps = [];

  // Use provided scheduler or queueJob by default
  // Unless sync is set to true in which case updates will run synchronously
  run.options = options.sync ? {} : { scheduler: options.scheduler || queueJob };

  // Run immediately to capture initial dependencies
  run();

  // Returns a stop function
  return () => {
    run.active = false;
    cleanup(run);
  };
}

/**
 * Records the current activeEffect as a dependency of (target, key).
 */
function track(target: object, key: string | symbol) {
  if (!activeEffect || !shouldTrack) return;

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

  // Link effect to dependency and dependency to effect
  if (!dep.has(activeEffect)) {
    dep.add(activeEffect);
    activeEffect.deps.push(dep);
  }
}

/**
 * Runs all effects that depend on (target, key).
 */
function trigger(target: object, key: string | symbol, _newVal?: any, _oldVal?: any) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  const effectsToRun = new Set<ReactiveEffect>();

  const add = (effects?: Set<ReactiveEffect>) => {
    if (effects) {
      effects.forEach((effect) => {
        if (effect !== activeEffect) {
          effectsToRun.add(effect);
        }
      });
    }
  };

  // Schedule effects for specific key
  add(depsMap.get(key));

  // Schedule effects for iteration (e.g. Object.keys, Map.size, Array traversal)
  if (key === ITERATE_KEY || key === 'length' || (Array.isArray(target) && key === 'length')) {
    add(depsMap.get(ITERATE_KEY));
    add(depsMap.get('length')); // Often redundant but safe
  }

  // If array length changes, or we add to array, trigger length deps
  if (Array.isArray(target) && key !== 'length') {
    add(depsMap.get('length'));
  }

  // Specific Array index handling (if length changes, indices might change)
  if (Array.isArray(target) && key === 'length') {
    depsMap.forEach((dep, key) => {
      if (key !== 'length' && key !== ITERATE_KEY) {
        add(dep);
      }
    });
  }

  effectsToRun.forEach((effect) => {
    if (effect.options?.scheduler) {
      effect.options.scheduler(effect);
    } else {
      effect();
    }
  });
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
