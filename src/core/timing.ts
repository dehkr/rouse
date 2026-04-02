import { LiteDebouncer, LiteThrottler } from '@tanstack/pacer-lite';
import type { AnyFunction } from '../types';
import { warn } from './shared';

export const DEFAULT_TIMING = {
  DEBOUNCE: 300,
  THROTTLE: 150,
};

export const TIME_REGEX = /^(\d*\.?\d+)(ms|s|m)?$/;

export interface TimingConfig {
  strategy?: 'debounce' | 'throttle';
  wait: number;
  leading?: boolean;
  trailing?: boolean;
}

/**
 * A callable function augmented with methods to manually flush or
 * cancel pending executions.
 */
export interface PacedFunction<T extends AnyFunction> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
}

/**
 * Parses an array of timing modifiers (e.g., 'debounce', '500ms', 'leading')
 * into a structured configuration object.
 */
export function getTimingConfig(
  modifiers: string[],
  defaults = {
    debounceWait: DEFAULT_TIMING.DEBOUNCE,
    throttleWait: DEFAULT_TIMING.THROTTLE,
  },
): TimingConfig {
  let strategy: TimingConfig['strategy'];
  let explicitWait: number | undefined;

  let leading: boolean | undefined;
  let trailing: boolean | undefined;

  for (const mod of modifiers) {
    if (['debounce', 'throttle'].includes(mod)) {
      strategy = mod as TimingConfig['strategy'];
    } else if (mod === 'leading') {
      leading = true;
      trailing = false;
    } else if (mod === 'trailing') {
      leading = false;
      trailing = true;
    } else if (mod === 'edges') {
      leading = true;
      trailing = true;
    } else {
      // TODO: consider making this check looser so parseTime can warn if invalid
      if (TIME_REGEX.test(mod)) {
        explicitWait = parseTime(mod);
      }
    }
  }

  // Determine final wait time (explicit > strategy default > safe fallback)
  let wait = explicitWait ?? defaults.debounceWait;
  if (explicitWait === undefined && strategy === 'throttle') {
    wait = defaults.throttleWait;
  }

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
 * Creates a debounced function that delays execution until after a specified
 * wait time has elapsed since the last invocation.
 */
export function debounce<T extends AnyFunction>(
  fn: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean; signal?: AbortSignal } = {},
): PacedFunction<T> {
  const instance = new LiteDebouncer(fn, { wait, ...options });
  const paced = (...args: Parameters<T>) => instance.maybeExecute(...args);

  paced.cancel = () => instance.cancel();
  paced.flush = () => instance.flush();

  if (options.signal) {
    options.signal.addEventListener('abort', () => paced.cancel(), { once: true });
  }

  return paced as PacedFunction<T>;
}

/**
 * Creates a throttled function that limits execution to at most once
 * within the specified wait time.
 */
export function throttle<T extends AnyFunction>(
  fn: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean; signal?: AbortSignal } = {},
): PacedFunction<T> {
  const instance = new LiteThrottler(fn, { wait, ...options });
  const paced = (...args: Parameters<T>) => instance.maybeExecute(...args);

  paced.cancel = () => instance.cancel();
  paced.flush = () => instance.flush();

  if (options.signal) {
    options.signal.addEventListener('abort', () => paced.cancel(), { once: true });
  }

  return paced as PacedFunction<T>;
}

/**
 * Wraps a function with a timing strategy (debounce or throttle) based on the
 * provided modifiers. Returns an augmented raw function if no strategy is matched.
 */
export function applyTiming<T extends AnyFunction>(
  fn: T,
  modifiers: string[],
  defaults = {
    debounceWait: DEFAULT_TIMING.DEBOUNCE,
    throttleWait: DEFAULT_TIMING.THROTTLE,
  },
): PacedFunction<T> {
  const config = getTimingConfig(modifiers, defaults);
  const debounced = config.strategy === 'debounce';
  const throttled = config.strategy === 'throttle';

  // Monkey-patch wrapper to warn about native prevent/stop methods
  // being used with timing modifiers.
  // TODO: too much?
  const wrappedFn = ((...args: any[]) => {
    const e = args[0];

    if (e && e instanceof Event && (debounced || throttled)) {
      const stoppers = [
        'preventDefault',
        'stopPropagation',
        'stopImmediatePropagation',
      ] as const;

      stoppers.forEach((method) => {
        const original = e[method].bind(e);
        e[method] = () => {
          warn(
            `${method}() called inside a ${config.strategy} callback. Use modifiers instead.`,
          );
          original();
        };
      });
    }
    return fn(...args);
  }) as T;

  if (debounced) {
    return debounce(wrappedFn, config.wait, {
      leading: config.leading,
      trailing: config.trailing,
    });
  }

  if (throttled) {
    return throttle(wrappedFn, config.wait, {
      leading: config.leading,
      trailing: config.trailing,
    });
  }

  // Fallback for immediate execution
  const paced = (...args: Parameters<T>) => fn(...args);
  paced.cancel = () => {};
  paced.flush = () => {};

  return paced as PacedFunction<T>;
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
  // Return immediately if it's a valid number
  if (typeof val === 'number') return val;

  const normalized = String(val).trim().toLowerCase();
  const match = normalized.match(TIME_REGEX);

  if (!match) {
    warn(`Invalid time value: '${val}'.`);
    return 0;
  }

  const [, amountStr = '0', unit] = match;
  const amount = parseFloat(amountStr);

  if (unit === 'm') {
    return amount * 60000;
  }
  return unit === 's' ? amount * 1000 : amount;
}
