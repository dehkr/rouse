import { LiteDebouncer, LiteThrottler } from '@tanstack/pacer-lite';
import type { AnyFunction } from '../types';

export const DEFAULT_DEBOUNCE_WAIT = 300;
export const DEFAULT_THROTTLE_WAIT = 150;
export const TIMING_REGEX = /^(\d*\.?\d+)(ms|s|m)?$/;

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
  defaults = { debounceWait: DEFAULT_DEBOUNCE_WAIT, throttleWait: DEFAULT_THROTTLE_WAIT },
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
      if (TIMING_REGEX.test(mod)) {
        explicitWait = parseTime(mod);
      } else {
        console.warn(`[Rouse] Invalid modifier: '${mod}'.`);
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
  options: { leading?: boolean; trailing?: boolean } = {},
): PacedFunction<T> {
  const instance = new LiteDebouncer(fn, { wait, ...options });
  const paced = (...args: Parameters<T>) => instance.maybeExecute(...args);

  paced.cancel = () => instance.cancel();
  paced.flush = () => instance.flush();

  return paced as PacedFunction<T>;
}

/**
 * Creates a throttled function that limits execution to at most once
 * within the specified wait time.
 */
export function throttle<T extends AnyFunction>(
  fn: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {},
): PacedFunction<T> {
  const instance = new LiteThrottler(fn, { wait, ...options });
  const paced = (...args: Parameters<T>) => instance.maybeExecute(...args);

  paced.cancel = () => instance.cancel();
  paced.flush = () => instance.flush();

  return paced as PacedFunction<T>;
}

/**
 * Wraps a function with a timing strategy (debounce or throttle) based on the
 * provided modifiers. Returns an augmented raw function if no strategy is matched.
 */
export function applyTiming<T extends AnyFunction>(
  fn: T,
  modifiers: string[],
  defaults = { debounceWait: DEFAULT_DEBOUNCE_WAIT, throttleWait: DEFAULT_THROTTLE_WAIT },
): PacedFunction<T> {
  const config = getTimingConfig(modifiers, defaults);

  if (config.strategy === 'debounce') {
    return debounce(fn, config.wait, {
      leading: config.leading,
      trailing: config.trailing,
    });
  }

  if (config.strategy === 'throttle') {
    return throttle(fn, config.wait, {
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
  const match = normalized.match(TIMING_REGEX);

  if (!match) {
    console.warn(`[Rouse] Invalid time value: '${val}'.`);
    return 0;
  }

  const [, amountStr = '0', unit] = match;
  const amount = parseFloat(amountStr);

  if (unit === 'm') {
    return amount * 60000;
  }
  return unit === 's' ? amount * 1000 : amount;
}
