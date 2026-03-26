import { parseDirective } from '../core/parser';
import { parseTime } from '../core/timing';
import { getDirective } from './prefix';

export const SLUG = 'tune' as const;

export interface TuningStrategy {
  retries?: number;
  abortKey?: string;
  timeout?: number;
  poll?: number;
}

// Store the parsed strategy for each element
const strategyCache = new WeakMap<
  HTMLElement,
  { raw: string; strategy: TuningStrategy }
>();

/**
 * Parses the client-side network tuning strategy for a fetch request.
 *
 * @example
 * ```html
 * <button
 *   rz-fetch="/api/search"
 *   rz-tune="retries: 3, timeout: 5s, abortKey: search, poll: 10s"
 * >
 * ```
 */
export function getTuningStrategy(el: HTMLElement): TuningStrategy {
  const raw = getDirective(el, SLUG) || '';

  const cached = strategyCache.get(el);
  if (cached && cached.raw === raw) {
    return cached.strategy;
  }

  const config: TuningStrategy = {};

  if (raw) {
    const parsed = parseDirective(raw);

    for (const [key, val] of parsed) {
      if (key === 'retries') {
        const parsedRetries = parseInt(val, 10);
        if (!Number.isNaN(parsedRetries)) {
          config.retries = parsedRetries;
        }
      } else if (key === 'abortKey') {
        config.abortKey = val;
      } else if (key === 'timeout') {
        config.timeout = parseTime(val);
      } else if (key === 'poll') {
        config.poll = parseTime(val);
      } else {
        console.warn(`[Rouse] Unknown rz-tune configuration key: '${key}'`);
      }
    }
  }

  strategyCache.set(el, { raw, strategy: config });

  return config;
}
