/*
 * Timing is applied once, in `dispatchTrigger`, before a trigger is routed. A trigger
 * source that timed its own action would apply the strategy twice.
 *
 * `leading` and `trailing` are independent flags, and naming either opts out of the
 * strategy's default edges.
 */
import type { AnyFn, TriggerModifiers, VoidFn } from '../types';
import { warn } from './diagnostics';

/**
 * Configuration options for timed functions.
 */
interface TimingConfig {
  /** Delay in milliseconds. */
  wait: number;
  /** Executes at the start of the event sequence. */
  leading: boolean;
  /** Executes at the end of the event sequence. */
  trailing: boolean;
  /**
   * `debounce` clumps a burst of events into a single execution.
   * `throttle` guarantees execution at a regulated, steady rate.
   */
  strategy: 'debounce' | 'throttle';
}

/**
 * Callable function augmented with a method to cancel a pending execution.
 */
interface TimedFn<T extends AnyFn> {
  /** Invokes the function, scheduling it per the configured debounce/throttle strategy. */
  (...args: Parameters<T>): void;
  /** Cancels a pending execution and discards its stored arguments. */
  cancel: VoidFn;
}

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_THROTTLE_MS = 150;

// Accepts an optional unit; a bare number is ms (e.g., `debounce-[300]`, `timeout: 5000`)
const TIME_REGEX = /^(\d*\.?\d+)(ms|s|m)?$/;

/**
 * Resolves a trigger's timing options into a strategy config, or `null` when the
 * trigger names no strategy.
 */
function getTimingConfig(options: TriggerModifiers): TimingConfig | null {
  const { debounce: debounceOpt, throttle: throttleOpt } = options;

  const strategy =
    debounceOpt !== undefined
      ? 'debounce'
      : throttleOpt !== undefined
        ? 'throttle'
        : null;
  if (!strategy) {
    return null;
  }

  const value = debounceOpt ?? throttleOpt;
  const explicitWait =
    value === undefined || value === true ? undefined : parseTime(value);

  // Explicit wait > strategy default
  const wait =
    explicitWait ?? (strategy === 'throttle' ? DEFAULT_THROTTLE_MS : DEFAULT_DEBOUNCE_MS);

  // Naming at least one edge opts out of the strategy defaults:
  // debounce fires on the trailing edge, throttle on both
  const named = options.leading !== undefined || options.trailing !== undefined;

  return {
    strategy,
    wait,
    leading: named ? !!options.leading : strategy === 'throttle',
    trailing: named ? !!options.trailing : true,
  };
}

/**
 * Creates a debounced function that delays execution until `wait` ms have
 * elapsed since the last call. Fires on the leading and/or trailing edge.
 */
function debounce<T extends AnyFn>(
  fn: T,
  { wait, leading, trailing }: TimingConfig,
): TimedFn<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timer === undefined) {
      // Leading edge: first call of a new burst
      if (leading) {
        fn(...args);
        lastArgs = undefined;
      }
    } else {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      // Trailing edge: only fires if a call landed since the last execution
      if (trailing && lastArgs) {
        fn(...lastArgs);
        lastArgs = undefined;
      }
    }, wait);
  };

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = lastArgs = undefined;
  };

  return debounced as TimedFn<T>;
}

/**
 * Creates a throttled function that runs at most once per `wait` ms.
 * Fires on the leading and/or trailing edge.
 */
function throttle<T extends AnyFn>(
  fn: T,
  { wait, leading, trailing }: TimingConfig,
): TimedFn<T> {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;

  const run = (args: Parameters<T>) => {
    fn(...args);
    lastRun = Date.now();
    // Clear any pending trailing call
    clearTimeout(timer);
    timer = lastArgs = undefined;
  };

  const throttled = (...args: Parameters<T>) => {
    const elapsed = Date.now() - lastRun;
    lastArgs = args;

    if (elapsed >= wait) {
      if (leading) {
        run(args);
      } else if (trailing && !timer) {
        timer = setTimeout(() => run(lastArgs as Parameters<T>), wait);
      }
    } else if (trailing && !timer) {
      timer = setTimeout(() => run(lastArgs as Parameters<T>), wait - elapsed);
    }
  };

  throttled.cancel = () => {
    clearTimeout(timer);
    timer = lastArgs = undefined;
  };

  return throttled as TimedFn<T>;
}

/**
 * Wraps a function with the timing strategy (debounce or throttle) the options name.
 * Returns `null` when they name none, so the caller runs `fn` directly.
 */
export function applyTiming<T extends AnyFn>(
  fn: T,
  options: TriggerModifiers,
): TimedFn<T> | null {
  const config = getTimingConfig(options);
  if (!config) {
    return null;
  }

  return config.strategy === 'debounce' ? debounce(fn, config) : throttle(fn, config);
}

/**
 * Converts a string with time suffixes (ms, s, m) or a raw number into milliseconds.
 * Defaults to milliseconds if no suffix is provided.
 *
 * @example
 * parseTime(500);     // 500
 * parseTime('500');   // 500
 * parseTime('500ms'); // 500
 * parseTime('5s');    // 5000
 * parseTime('1.5s');  // 1500
 * parseTime('0.5m');  // 30000
 */
export function parseTime(val?: string | number): number {
  // Treat empty or falsy values as valid zero states
  if (!val) {
    return 0;
  }
  if (typeof val === 'number') {
    return val;
  }

  const normalized = val.trim().toLowerCase();
  const match = normalized.match(TIME_REGEX);

  if (!match) {
    if (__DEV__) {
      warn(`Invalid time value: '${val}'.`);
    }
    return 0;
  }

  const [, amountStr = '0', unit] = match;
  const amount = parseFloat(amountStr);

  if (unit === 'm') {
    return amount * 60000;
  }
  return unit === 's' ? amount * 1000 : amount;
}
