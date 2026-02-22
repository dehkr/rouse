import { parseDirective } from '../dom/parser';
import type { RouseReqOpts } from '../types';
import { getDirective } from './prefix';

export const SLUG = 'tune' as const;

export interface TuningStrategy extends Partial<RouseReqOpts> {
  debounce?: number;
  throttle?: number;
  poll?: number;
  trigger?: string[];
  modifiers?: Record<string, string[]>;
}

const numKeys = ['retry', 'timeout', 'debounce', 'throttle', 'poll'] as const;
type NumberKeys = typeof numKeys[number];

function isNumberKey(key: string): key is NumberKeys {
  return numKeys.includes(key as NumberKeys);
}

/**
 * Parses the client-side tuning strategy for a fetch request.
 * 
 * @example
 * ```html
 * <button
 *   rz-fetch="/api/search" 
 *   rz-tune="retry: 3, timeout: 5000, key: search, debounce.leading: 500"
 * >
 * ```
 */
export function getTuningStrategy(el: HTMLElement): TuningStrategy {
  const raw = getDirective(el, SLUG);
  if (!raw) return {};

  const config: TuningStrategy = { modifiers: {} };
  const parsed = parseDirective(raw);

  for (const [key, val, modifiers] of parsed) {
    // Attach modifiers to the config object
    if (config.modifiers) {
      config.modifiers[key] = modifiers;
    }

    if (isNumberKey(key)) {
      config[key] = parseInt(val, 10);
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
