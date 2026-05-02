import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { resolveProps } from '../core/props';
import { getDirectiveValue, hasDirective, kebabToCamel } from '../core/shared';
import { parseTime } from '../core/timing';
import type { ConfigDirective, DirectiveSlug, RouseRequest } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'request' as const satisfies DirectiveSlug;

export const rzRequest = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
} as const satisfies ConfigDirective<Partial<RouseRequest>>;

// =======================================================================================

const BOOLEAN_KEYS = ['keepalive', 'mutate', 'dispatch-events'];
const TIME_KEYS = ['timeout', 'retry-delay'];

/**
 * Parses the `rz-request` directive to build a native Fetch API configuration object.
 * Handles native Fetch API properties (mode, credentials, etc.) alongside
 * Rouse-specific network configuration (timeout, retries, abortKey).
 */
function getConfig(el: Element, app?: RouseApp): Partial<RouseRequest> {
  const value = getDirectiveValue(el, SLUG);
  if (!value) return {};

  const parsed = parseDirectiveValue(value);
  const config: Record<string, any> = {};

  for (const [key, val] of parsed) {
    if (!key) continue;

    // Dynamic payload delimiters
    if (val.match(/^[?#@{]/)) {
      config[key] = resolveProps(val, app?.stores, false);
    }

    // Booleans
    else if (BOOLEAN_KEYS.includes(key)) {
      config[kebabToCamel(key)] = val === 'true' || val === '';
    }

    // timeout & retry-delay
    else if (TIME_KEYS.includes(key)) {
      config[kebabToCamel(key)] = parseTime(val);
    }

    // retry
    else if (key === 'retry') {
      const parsedRetry = parseInt(val, 10);
      if (!Number.isNaN(parsedRetry)) {
        config[key] = parsedRetry;
      }
    }

    // RequestInit stuff and 'abort-key'
    else {
      config[kebabToCamel(key)] = val;
    }
  }

  return config as Partial<RouseRequest>;
}
