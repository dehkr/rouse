/*
 * Each `apply` runs in its own `effectScope`, so effects it creates stop before the
 * next `apply` and when the effect stops, matching one-argument `effect`. The scope is
 * created untracked: linked to the effect, every read in `apply` would re-run it.
 *
 * `compute` is a `computed`, not a manual `!==` check. The effect then re-runs only
 * when the value changes, so alien-signals runs the previous cleanup right before the
 * next `apply`. A manual check would re-run on every `compute` change and fire the
 * cleanup even when `apply` is skipped.
 *
 * Catch a throw inside the `computed` and rethrow it from the effect body. alien-signals
 * evaluates the `computed` in its dirty check, before it re-arms the effect, so a throw
 * escaping there stops the effect for good. A fresh `ComputeError` always compares
 * changed, and the deps read before the throw stay tracked, so the next write recovers.
 *
 * Only a function return is a cleanup. alien-signals calls any truthy return before
 * the next run, so a concise arrow such as `(t) => document.title = t` would throw.
 * Internal call sites import alien-signals' `effect` directly and skip this guard.
 *
 * alien-signals stores a run's cleanup after the run returns, so a run that stops its
 * own effect leaves a cleanup nothing calls. Run that cleanup immediately instead.
 */
import { computed, effectScope, effect as rawEffect } from 'alien-signals';
import { untracked } from './reactive';

type Cleanup = () => void;

/** Options for the two-argument form of `effect()`. */
export interface EffectOptions {
  /** Skip the first `apply`. The first call then receives the first changed value. */
  defer?: boolean;
}

/** Carries a throw in `compute` out of the `computed`, to rethrow from the effect. */
class ComputeError {
  readonly error: unknown;
  constructor(error: unknown) {
    this.error = error;
  }
}

function asCleanup(value: unknown): Cleanup | undefined {
  return typeof value === 'function' ? (value as Cleanup) : undefined;
}

/**
 * Runs `fn` untracked in its own effect scope. Returns a cleanup that stops the
 * scope, then runs the cleanup `fn` returned. Stops the scope and rethrows if `fn` throws.
 */
function runOwned(fn: () => unknown): Cleanup {
  let result: unknown;
  // `effectScope` returns no stop function when its body throws
  let failure: { error: unknown } | undefined;
  const stopRun = untracked(() =>
    effectScope(() => {
      try {
        result = fn();
      } catch (error) {
        failure = { error };
      }
    }),
  );
  if (failure) {
    stopRun();
    throw failure.error;
  }
  const cleanup = asCleanup(result);
  return () => {
    stopRun();
    cleanup?.();
  };
}

/**
 * Runs `fn` now, and again whenever a reactive value it read changes.
 *
 * If `fn` returns a function, that function is a cleanup. It runs before each re-run
 * and when the effect stops. Any other return value is ignored.
 *
 * Stops with the scope when called during setup or `connect()`. Otherwise it runs
 * until the returned function is called.
 *
 * @param fn - The side effect. Every reactive read inside it is tracked.
 * @returns A function that stops the effect.
 *
 * @example
 * const stop = effect(() => console.log(state.count));
 */
export function effect(fn: () => unknown): () => void;
/**
 * Runs `apply` with the value `compute` returns, and again whenever that value
 * changes (compared with `!==`).
 *
 * - **Tracking:** only reads inside `compute` trigger a re-run. Reads inside `apply`
 *   are never tracked.
 * - **First run:** `apply` runs immediately, with `prev` set to `undefined`. With
 *   `defer: true`, it first runs on the first change, with `prev` set to the initial
 *   value.
 * - **Stopping:** `apply` receives `stop`, which ends the effect from any run,
 *   including the first.
 * - **Cleanup:** if `apply` returns a function, it runs before the next `apply` and
 *   when the effect stops. Any other return value is ignored.
 * - **Nested effects:** an effect created inside `apply` stops before the next `apply`
 *   and when this effect stops.
 *
 * Stops with the scope when called during setup or `connect()`. Otherwise it runs
 * until the returned function is called.
 *
 * @param compute - Reads the state to follow and returns a value. Must `return`.
 *   A signal works as is.
 * @param apply - Acts on the new value. Receives the previous value and `stop`.
 * @param options - `defer` skips the first `apply`.
 * @returns A function that stops the effect.
 *
 * @example
 * effect(
 *   () => state.query,
 *   (query) => {
 *     const url = new URL(location.href);
 *     url.searchParams.set('q', query);
 *     history.replaceState(null, '', url);
 *   },
 * );
 */
export function effect<T>(
  // The signal shape lets a signal infer `T` from its getter. Inferring from `() => T`
  // alone picks a signal's last signature, the setter, and types `T` as `void`.
  compute: { (): T; (value: T): void } | (() => T),
  apply: (value: T, prev: T | undefined, stop: () => void) => unknown,
  options?: EffectOptions,
): () => void;
export function effect<T>(
  computeOrFn: () => T,
  apply?: (value: T, prev: T | undefined, stop: () => void) => unknown,
  options?: EffectOptions,
): () => void {
  let handle: (() => void) | undefined;
  let stopped = false;
  // Callable before `rawEffect` returns, so `apply` can stop the first run
  const stop = () => {
    stopped = true;
    handle?.();
  };

  let run: () => Cleanup | undefined;
  if (apply) {
    // alien-signals passes the previous value to a computed getter. A bare signal
    // as `compute` would write it back, so call `compute` with no arguments.
    const value = computed<T | ComputeError>(() => {
      try {
        return computeOrFn();
      } catch (error) {
        return new ComputeError(error);
      }
    });
    let prev: T | undefined;
    let first = true;

    run = () => {
      const next = value();
      if (next instanceof ComputeError) {
        throw next.error;
      }
      if (first) {
        first = false;
        if (options?.defer) {
          prev = next;
          return;
        }
      }
      const last = prev;
      prev = next;
      return runOwned(() => apply(next, last, stop));
    };
  } else {
    run = () => asCleanup(computeOrFn());
  }

  let creating = true;
  let creationFailure: { error: unknown } | undefined;
  handle = rawEffect(() => {
    let cleanup: Cleanup | undefined;
    try {
      cleanup = run();
    } catch (error) {
      if (!creating) {
        throw error;
      }
      // Rethrow once `handle` exists, so `stop` still works after the effect recovers
      creationFailure = { error };
      return;
    }
    if (stopped && cleanup) {
      untracked(cleanup);
      return;
    }
    return cleanup;
  });
  creating = false;
  if (stopped) {
    handle();
  }
  if (creationFailure) {
    throw creationFailure.error;
  }
  return stop;
}
