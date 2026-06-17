import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { resolveProps } from '../core/props';
import { getDirectiveValue, kebabToCamel } from '../core/shared';
import { parseTime } from '../core/timing';
import type { ConfigDirective, DirectiveSlug, RouseRequest } from '../types';

const BOOLEAN_KEYS = [
  'keepalive',
  'mutate',
  'dispatch-events',
  'rollback-on-error',
  'skip-interceptors',
];

const TIME_KEYS = ['timeout', 'retry-delay'];

/**
 * Parses a `rz-request*` directive value into a partial RouseRequest config.
 * Shared by `rz-request` and its action-specific variants.
 */
export function parseRequestConfig(
  value: string | null | undefined,
  app?: RouseApp,
): Partial<RouseRequest> {
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

/**
 * Factory for `rz-request` and its variants.
 */
export function defineRequestDirective(
  slug: DirectiveSlug,
): ConfigDirective<Partial<RouseRequest>> {
  return {
    slug,
    getConfig: (el, app) => parseRequestConfig(getDirectiveValue(el, slug), app),
  };
}

export const rzRequest = defineRequestDirective('request');
export const rzSaveRequest = defineRequestDirective('save-request');
export const rzFetchRequest = defineRequestDirective('fetch-request');
export const rzRefreshRequest = defineRequestDirective('refresh-request');
