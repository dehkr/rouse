import { parseDirective } from '../core/parser';
import { getDirective } from './prefix';

export const SLUG = 'tune' as const;

export interface TuningStrategy {
  retry?: number;
  abortKey?: string;
  trigger?: string[];
  timingModifiers?: string[];
}

/**
 * Parses the client-side tuning strategy for a fetch request.
 *
 * @example
 * ```html
 * <button
 *   rz-fetch="/api/search"
 *   rz-tune="retry: 3, timeout.5s, key: search, debounce.leading.500ms"
 * >
 * ```
 */
export function getTuningStrategy(el: HTMLElement): TuningStrategy {
  const raw = getDirective(el, SLUG);
  if (!raw) return {};

  const timingModifiers: string[] = [];
  const config: TuningStrategy = {};
  const parsed = parseDirective(raw);

  for (const [key, val, modifiers] of parsed) {
    if (key === 'retry') {
      config.retry = parseInt(val, 10);
    } else if (key === 'key') {
      config.abortKey = val;
    } else if (key === 'trigger' && val) {
      config.trigger = val
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (['debounce', 'throttle', 'poll', 'timeout'].includes(key)) {
      if (val) {
        console.warn(
          `[Rouse] Invalid syntax for timing behavior '${key}'. Use dot-notation (e.g., 'debounce.500ms') instead of a key-value pair.`,
        );
      }
      timingModifiers.push(key, ...modifiers);
    }
  }

  if (timingModifiers.length > 0) {
    config.timingModifiers = timingModifiers;
  }

  return config;
}
