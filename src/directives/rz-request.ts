import type { RouseApp } from '../core/app';
import { parseDirective } from '../core/parser';
import { parseTime } from '../core/timing';
import { resolvePayload } from '../dom/utils';
import type { RouseRequestOpts } from '../types';
import { getDirective } from './prefix';

export const SLUG = 'request' as const;
const BOOLEAN_KEYS = new Set(['keepalive']);

/**
 * Parses the rz-request directive to build a native Fetch API configuration object.
 * Handles native Fetch API properties (mode, credentials, etc.) alongside
 * Rouse-specific network tuning (timeout, retries, abortKey).
 */
export function getRequestConfig(
  el: HTMLElement,
  app?: RouseApp,
): Partial<RouseRequestOpts> {
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
    // Rouse Tuning: Timeout
    else if (key === 'timeout') {
      config[key] = parseTime(val);
    }
    // Rouse Tuning: Retries
    else if (key === 'retries') {
      const parsedRetries = parseInt(val, 10);
      if (!Number.isNaN(parsedRetries)) {
        config[key] = parsedRetries;
      }
    }
    // Rouse Tuning: Concurrency Abort Key
    else if (key === 'abortKey') {
      config[key] = val;
    }
    // Strings (default native Fetch properties)
    else {
      config[key] = val;
    }
  }

  return config as Partial<RouseRequestOpts>;
}
