import { parseDirective } from '../dom/parser';
import type { RouseReqOpts } from '../types';
import { getDirective } from './prefix';

export const SLUG = 'req' as const;

export interface RequestConfig extends Partial<RouseReqOpts> {
  debounce?: number;
  poll?: number;
}

type NumberKeys = 'retry' | 'timeout' | 'debounce' | 'poll';

/**
 * Parses the rz-req directive.
 * Example: rz-req="retry: 3, timeout: 5000, key: main-search"
 */
export function getRequestConfig(el: HTMLElement): RequestConfig {
  const raw = getDirective(el, SLUG);
  if (!raw) return {};

  const config: RequestConfig = {};
  const parsed = parseDirective(raw);

  // TODO: allow passing other random flags (custom headers for example)
  for (const [key, val] of parsed) {
    if (['retry', 'timeout', 'debounce', 'poll'].includes(key)) {
      config[key as NumberKeys] = parseInt(val, 10);
    } else if (key === 'key') {
      config.abortKey = val;
    }
  }

  return config;
}
