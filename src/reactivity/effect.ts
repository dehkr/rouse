import { activeEffectScope } from './scope';

export const RAW = Symbol('raw');
export const IS_REACTIVE = Symbol('is_reactive');
export const ITERATE_KEY = Symbol('iterate_key');

// TYPES

type Dep = Set<ReactiveEffect>;
type KeyToDepMap = Map<string | symbol, Dep>;

export interface EffectOptions {
  lazy?: boolean;
  scheduler?: (job: ReactiveEffect) => void;
  sync?: boolean;
}

export interface ReactiveEffect<T = any> {
  (): T;
  active: boolean;
  paused: boolean;
  deps: Dep[];
  options: EffectOptions;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export interface ComputedRef<T> {
  readonly value: T;
  readonly effect: ReactiveEffect<T>;
}

// GLOBALS

let activeEffect: ReactiveEffect | null = null;
let shouldTrack = true;
const effectStack: ReactiveEffect[] = [];
const targetMap = new WeakMap<object, KeyToDepMap>();
const pausedEffects = new WeakSet<ReactiveEffect>();

export function pauseTracking() {
  shouldTrack = false;
}

export function resetTracking() {
  shouldTrack = true;
}

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

// EFFECTS

/**
 * Runs a function immediately and re-runs it whenever its reactive dependencies change.
 *
 * @param fn The function to execute and track.
 * @returns A stop function that marks the effect as inactive to prevent further runs.
 */
export function effect<T = any>(
  fn: () => void,
  options: EffectOptions = {},
): ReactiveEffect<T> {
  const run = (() => {
    // If effect is stopped the normal function is returned
    if (!run.active) {
      return fn();
    }
    cleanup(run);

    try {
      effectStack.push(run);
      activeEffect = run;
      return fn(); // Return the value for computed
    } finally {
      effectStack.pop();
      activeEffect = effectStack[effectStack.length - 1] ?? null;
    }
  }) as ReactiveEffect<T>;

  run.active = true;
  run.paused = false;
  run.deps = [];

  // Use provided scheduler or queueJob by default
  // Unless sync is set to true in which case updates will run synchronously
  run.options = options.sync ? {} : { scheduler: options.scheduler || queueJob };

  // Attach state methods (pause, resume, stop)
  run.pause = () => {
    run.paused = true;
  };
  run.resume = () => {
    if (run.paused) {
      run.paused = false;
      // If this effect was triggered while paused, run it now
      if (pausedEffects.has(run)) {
        pausedEffects.delete(run);
        triggerEffect(run);
      }
    }
  };
  run.stop = () => {
    run.active = false;
    cleanup(run);
  };

  // Run immediately (if not lazy) to capture initial dependencies
  if (!options.lazy) {
    run();
  }

  // Register with the current scope
  if (activeEffectScope) {
    activeEffectScope.effects.push(run);
  }

  return run;
}

/**
 * Creates a read-only reactive reference that lazily evaluates and caches its value.
 *
 * @template T -The type of the computed valuee.
 * @param getter - A function that calculates the value. It should rely on reactive state.
 * @returns A read-only ref object with a `.value` property.
 * @example
 * const state = reactive({ count: 1 });
 * const double = computed(() => state.count * 2);
 *
 * console.log(double.value); // 2 (calculated)
 * console.log(double.value); // 2 (cached - getter not run)
 *
 * state.count++; // double.value is marked dirty, but not calculated yet
 *
 * console.log(double.value); // 4 (re-calculated)
 */
export function computed<T>(getter: () => T): ComputedRef<T> {
  let value: T;
  let dirty = true;

  const runner = effect(getter, {
    lazy: true,
    scheduler: () => {
      // Mark dirty and notify listeners if dep changed
      if (!dirty) {
        dirty = true;
        trigger(computedRef, 'value');
      }
    },
  });

  const computedRef = {
    get value() {
      track(computedRef, 'value');
      if (dirty) {
        // Run the effect to get the new value
        value = runner();
        dirty = false;
      }
      return value;
    },
    effect: runner,
  };

  return computedRef as ComputedRef<T>;
}

/**
 * Records the current activeEffect as a dependency of (target, key).
 */
export function track(target: object, key: string | symbol) {
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
export function trigger(
  target: object,
  key: string | symbol,
  _newVal?: any,
  _oldVal?: any,
) {
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
  if (
    key === ITERATE_KEY ||
    key === 'length' ||
    (Array.isArray(target) && key === 'length')
  ) {
    add(depsMap.get(ITERATE_KEY));
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
    if (effect.paused) {
      pausedEffects.add(effect);
    } else {
      triggerEffect(effect);
    }
  });
}

function triggerEffect(effect: ReactiveEffect) {
  if (effect.options.scheduler) {
    effect.options.scheduler(effect);
  } else {
    effect();
  }
}

/**
 * Deletes all dependencies of an effect.
 */
function cleanup(effect: ReactiveEffect) {
  const { deps } = effect;
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i]?.delete(effect);
    }
    deps.length = 0;
  }
}
