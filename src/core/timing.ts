import type { AnyFn, VoidFn } from '../types';
import { warn } from './shared';

export const DEFAULT_DEBOUNCE_MS = 300;
export const DEFAULT_THROTTLE_MS = 150;

/**
 * Options that configure how a timed function is executed.
 *
 * - **debounce**: clumps a burst of events into a single execution.
 * - **throttle**: guarantees execution at a regulated, steady rate.
 * - **leading:** executes at the start of the event sequence.
 * - **trailing:** executes at the end of the event sequence.
 */
export interface TimingConfig {
  wait: number;
  leading?: boolean;
  trailing?: boolean;
  strategy?: 'debounce' | 'throttle';
}

/**
 * A callable function augmented with methods to manually flush
 * or cancel pending executions.
 */
export interface TimedFn<T extends AnyFn> {
  (...args: Parameters<T>): void;
  cancel: VoidFn;
  flush: VoidFn;
}

/**
 * Parses an array of timing modifiers (e.g., 'debounce', '500ms', 'leading')
 * into a structured configuration object.
 */
export function getTimingConfig(
  modifiers: string[],
  defaults = {
    debounceWait: DEFAULT_DEBOUNCE_MS,
    throttleWait: DEFAULT_THROTTLE_MS,
  },
): TimingConfig {
  let strategy: TimingConfig['strategy'];
  let explicitWait: number | undefined;

  let leading: boolean | undefined;
  let trailing: boolean | undefined;

  for (const mod of modifiers) {
    if (mod === 'debounce' || mod === 'throttle') {
      strategy = mod;
    } else if (mod === 'leading') {
      leading = true;
      trailing = false;
    } else if (mod === 'trailing') {
      leading = false;
      trailing = true;
    } else if (mod === 'edges') {
      leading = true;
      trailing = true;
    } else if (/^(\d*\.?\d+)(ms|s|m)$/.test(mod)) {
      // Regex ensures time value has an explicit suffix to prevent collisions
      // with keyboard key modifiers (e.g., 'keydown.debounce.5').
      explicitWait = parseTime(mod);
    }
  }

  // Determine final wait time (explicit > strategy default > safe fallback)
  const defaultWait =
    strategy === 'throttle' ? defaults.throttleWait : defaults.debounceWait;
  const wait = explicitWait ?? defaultWait;

  // Apply common pattern defaults for leading/trailing edge execution
  if (leading === undefined && trailing === undefined) {
    if (strategy === 'throttle') {
      leading = true;
      trailing = true;
    } else if (strategy === 'debounce') {
      leading = false;
      trailing = true;
    }
  }

  return { strategy, wait, leading, trailing };
}

/**
 * Creates a debounced function that delays execution until `wait` ms have
 * elapsed since the last call. Fires on the leading and/or trailing edge.
 */
export function debounce<T extends AnyFn>(
  fn: T,
  { wait, leading = false, trailing = true }: TimingConfig,
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
  debounced.flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = undefined;
    }
  };

  return debounced as TimedFn<T>;
}

/**
 * Creates a throttled function that runs at most once per `wait` ms.
 * Fires on the leading and/or trailing edge.
 */
export function throttle<T extends AnyFn>(
  fn: T,
  { wait, leading = true, trailing = true }: TimingConfig,
): TimedFn<T> {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;

  const run = (args: Parameters<T>) => {
    fn(...args);
    lastRun = Date.now();
    // Clear any pending trailing call (e.g. when invoked via flush)
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
  throttled.flush = () => {
    if (lastArgs) run(lastArgs);
  };

  return throttled as TimedFn<T>;
}

/**
 * Wraps a function with a timing strategy (debounce or throttle) based on the
 * provided modifiers. Returns an augmented raw function if no strategy is matched.
 */
export function applyTiming<T extends AnyFn>(
  fn: T,
  modifiers: string[],
  defaults = {
    debounceWait: DEFAULT_DEBOUNCE_MS,
    throttleWait: DEFAULT_THROTTLE_MS,
  },
): TimedFn<T> {
  const config = getTimingConfig(modifiers, defaults);

  if (config.strategy === 'debounce') {
    return debounce(fn, {
      wait: config.wait,
      leading: config.leading,
      trailing: config.trailing,
    });
  }

  if (config.strategy === 'throttle') {
    return throttle(fn, {
      wait: config.wait,
      leading: config.leading,
      trailing: config.trailing,
    });
  }

  // Fallback for immediate execution
  const timed = (...args: Parameters<T>) => fn(...args);
  timed.cancel = () => {};
  timed.flush = () => {};

  return timed as TimedFn<T>;
}

// Suffix optional to allow plain numbers (e.g., `timeout: 5000`)
const TIME_REGEX = /^(\d*\.?\d+)(ms|s|m)?$/;

/**
 * Checks if a string or number matches the supported time formats.
 */
export function isTimeModifier(val: unknown): boolean {
  return TIME_REGEX.test(String(val).trim().toLowerCase());
}

/**
 * Converts a string with time suffixes (ms, s, m) or a raw number into milliseconds.
 * Defaults to milliseconds if no suffix is provided.
 *
 * @example
 * parseTime(500)     // 500
 * parseTime('500')   // 500
 * parseTime('500ms') // 500
 * parseTime('5s')    // 5000
 * parseTime('1.5s')  // 1500
 * parseTime('0.5m')  // 30000
 */
export function parseTime(val?: string | number): number {
  // Treat empty or falsy values as valid zero states
  if (!val && val !== 0 && val !== '0') return 0;
  if (typeof val === 'number') return val;

  const normalized = String(val).trim().toLowerCase();
  const match = normalized.match(TIME_REGEX);

  if (!match) {
    warn(`Invalid time value: '${val}'.`);
    return 0;
  }

  const [, amountStr = '0', unit] = match;
  const amount = parseFloat(amountStr);

  if (unit === 'm') return amount * 60000;
  return unit === 's' ? amount * 1000 : amount;
}
