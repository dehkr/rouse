import { parseDirective } from '../dom/parser';
import type { RouseReqOpts } from '../types';
import { getDirective } from './prefix';

export const SLUG = 'tune' as const;

export interface TuningStrategy extends Partial<RouseReqOpts> {
  debounce?: number;
  poll?: number;
  trigger?: string[];
}

type NumberKeys = 'retry' | 'timeout' | 'debounce' | 'poll';

/**
 * Parses the client-side tuning strategy for a fetch request.
 * Example: rz-tune="retry: 3, timeout: 5000, key: main-search"
 */
export function getTuningStrategy(el: HTMLElement): TuningStrategy {
  const raw = getDirective(el, SLUG);
  if (!raw) return {};

  const config: TuningStrategy = {};
  const parsed = parseDirective(raw);

  for (const [key, val] of parsed) {
    if (['retry', 'timeout', 'debounce', 'poll'].includes(key)) {
      config[key as NumberKeys] = parseInt(val, 10);
    } else if (key === 'key') {
      config.abortKey = val;
    } else if (key === 'trigger' && val) {
      // Split multiple triggers by pipe: "mouseover|keyup"
      config.trigger = val
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  return config;
}
