import type { RouseApp } from '../core/app';
import { parseDirective } from '../core/parser';
import { resolvePayload } from '../dom/utils';
import { getDirective } from './prefix';

export const SLUG = 'request' as const;
const BOOLEAN_KEYS = new Set(['keepalive']);

/**
 * Parses the rz-request directive to build a native Fetch API configuration object.
 * Strictly limited to native RequestInit properties (mode, credentials, headers, etc.).
 */
export function getRequestConfig(el: HTMLElement, app?: RouseApp): RequestInit {
  const raw = getDirective(el, SLUG);
  if (!raw) return {};

  const parsed = parseDirective(raw);
  const config: Record<string, any> = {};

  for (const [key, val] of parsed) {
    if (!key) continue;

    // Dynamic payload delimiters
    // ?: URL params, #: JSON script ID, @: store data, {: inline JSON
    if (val.match(/^[?#@{]/)) {
      config[key] = resolvePayload(val, app?.stores, false);
    }
    // Booleans
    else if (BOOLEAN_KEYS.has(key)) {
      config[key] = val === 'true' || val === '';
    }
    // Strings (default)
    else {
      config[key] = val;
    }
  }

  return config as RequestInit;
}
