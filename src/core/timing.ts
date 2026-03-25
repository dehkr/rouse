import { LiteDebouncer, LiteThrottler } from '@tanstack/pacer-lite';

export type AnyFunction = (...args: any[]) => any;

export const DEFAULT_DEBOUNCE_WAIT = 300;
export const DEFAULT_THROTTLE_WAIT = 150;

export interface TimingConfig {
  strategy?: 'debounce' | 'throttle' | 'poll' | 'timeout';
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
    if (['debounce', 'throttle', 'poll', 'timeout'].includes(mod)) {
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
      const match = mod.match(/^(\d+)(ms|s)$/);
      if (match) {
        const [, rawValue = '', unit = 'ms'] = match;
        const value = parseInt(rawValue, 10);
        explicitWait = unit === 's' ? value * 1000 : value;
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

  // Fallback for immediate execution, poll, or timeout
  const paced = (...args: Parameters<T>) => fn(...args);
  paced.cancel = () => {};
  paced.flush = () => {};

  return paced as PacedFunction<T>;
}

/**
 * Converts a string with time suffixes (s, ms) or a raw number into milliseconds.
 * Defaults to milliseconds if no suffix is provided.
 *
 * @example
 * parseTime(500)     // 500
 * parseTime('500')   // 500
 * parseTime('500ms') // 500
 * parseTime('5s')    // 5000
 * parseTime('1.5s')  // 1500
 */
export function parseTime(val?: string | number): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;

  const match = String(val)
    .trim()
    .toLowerCase()
    .match(/^([\d.]+)(ms|s)?$/);
    
  if (!match) return 0;

  const [, amountStr = '0', unit] = match;
  const amount = parseFloat(amountStr);

  if (isNaN(amount)) return 0;

  return unit === 's' ? amount * 1000 : amount;
}
