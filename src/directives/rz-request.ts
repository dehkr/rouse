import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { getDirectiveValue } from '../core/shared';
import { parseTime } from '../core/timing';
import { resolvePayload } from '../dom/utils';
import type { DirectiveSchema, RouseRequestOpts } from '../types';

export const rzRequest = {
  slug: 'request',
  handler: getRequestConfig,
} as const satisfies DirectiveSchema;

const BOOLEAN_KEYS = new Set(['keepalive']);

/**
 * Parses the `rz-request`` directive to build a native Fetch API configuration object.
 * Handles native Fetch API properties (mode, credentials, etc.) alongside
 * Rouse-specific network configuration (timeout, retries, abortKey).
 */
export function getRequestConfig(
  el: HTMLElement,
  app?: RouseApp,
): Partial<RouseRequestOpts> {
  const rawValue = getDirectiveValue(el, 'request');
  if (!rawValue) return {};

  const parsed = parseDirectiveValue(rawValue);
  const config: Record<string, any> = {};

  for (const [key, val] of parsed) {
    if (!key) continue;

    // Dynamic payload delimiters
    // ?: URL params, #: JSON script ID, @: store data, {: inline JSON
    if (val.match(/^[?#@{]/)) {
      config[key] = resolvePayload(val, app?.stores, false);
    }

    // Native RequestInit (fetch): booleans
    else if (BOOLEAN_KEYS.has(key)) {
      config[key] = val === 'true' || val === '';
    }

    // Custom Rouse config: timeout
    else if (key === 'timeout') {
      config[key] = parseTime(val);
    }

    // Custom Rouse config: retries
    else if (key === 'retries') {
      const parsedRetries = parseInt(val, 10);
      if (!Number.isNaN(parsedRetries)) {
        config[key] = parsedRetries;
      }
    }

    // Custom Rouse config: concurrency abort key
    else if (key === 'abortKey') {
      config[key] = val;
    }
    
    // Native RequestInit (fetch): strings
    else {
      config[key] = val;
    }
  }

  return config as Partial<RouseRequestOpts>;
}
