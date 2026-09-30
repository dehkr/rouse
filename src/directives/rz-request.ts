import { getDirectiveValue } from '../core/attributes';
import { warn } from '../core/diagnostics';
import { parseDirectiveValue } from '../core/parser';
import { parseTime } from '../core/timing';
import type { ConfigDirective, FetchRequest } from '../types';

/** How a config value is coerced. */
type ConfigValueType = 'string' | 'boolean' | 'duration';

/**
 * Keys `rz-request` accepts, and how each value is coerced. A key outside this
 * table warns and is dropped, so a typo or a key belonging to another directive
 * can't sit in a config doing nothing.
 */
const KEYS = {
  method: 'string',
  timeout: 'duration',
  'abort-key': 'string',
  credentials: 'string',
  keepalive: 'boolean',
  redirect: 'string',
  cache: 'string',
} as const satisfies Record<string, ConfigValueType>;

/**
 * Request options for the element's `rz-fetch`, written as `key: value` pairs.
 *
 * @example
 * <button data-rz-fetch="click: /save" data-rz-request="method: post, timeout: 5s">
 */
function getConfig(el: Element): Partial<FetchRequest> {
  const value = getDirectiveValue(el, 'request');
  if (!value) return {};

  const config: Record<string, any> = {};

  for (const [key, rawVal] of parseDirectiveValue(value)) {
    if (!key) continue;

    const type = KEYS[key as keyof typeof KEYS];

    if (!type) {
      __DEV__ &&
        warn(
          key === 'headers' || key === 'indicator'
            ? `rz-request: '${key}' belongs on data-rz-${key}. Ignoring.`
            : `rz-request: unknown key '${key}'. Ignoring.`,
          el,
        );
      continue;
    }

    const val = rawVal ?? '';

    if (type === 'boolean') {
      config[kebabToCamel(key)] = val === 'true' || val === '';
    } else if (type === 'duration') {
      config[kebabToCamel(key)] = parseTime(val);
    } else {
      config[kebabToCamel(key)] = val;
    }
  }

  return config as Partial<FetchRequest>;
}

function kebabToCamel(str: string) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export const rzRequest = { getConfig } as const satisfies ConfigDirective<
  Partial<FetchRequest>
>;
