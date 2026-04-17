import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { resolveProps } from '../core/props';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { parseTime } from '../core/timing';
import type { Directive, RouseRequest } from '../types';

export const rzRequest = {
  existsOn,
  getValue,
  getConfig,
} as const satisfies Directive;

const BOOLEAN_KEYS = new Set(['keepalive']);

function existsOn(el: Element) {
  return hasDirective(el, 'request');
}

function getValue(el: Element) {
  return getDirectiveValue(el, 'request');
}

/**
 * Parses the `rz-request` directive to build a native Fetch API configuration object.
 * Handles native Fetch API properties (mode, credentials, etc.) alongside
 * Rouse-specific network configuration (timeout, retries, abortKey).
 */
function getConfig(
  el: Element,
  app?: RouseApp,
): Partial<RouseRequest> {
  const value = getValue(el);
  if (!value) return {};

  const parsed = parseDirectiveValue(value);
  const config: Record<string, any> = {};

  for (const [key, val] of parsed) {
    if (!key) continue;

    // Dynamic payload delimiters
    // ?: URL params, #: JSON script ID, @: store data, {: inline JSON
    if (val.match(/^[?#@{]/)) {
      config[key] = resolveProps(val, app?.stores, false);
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

  return config as Partial<RouseRequest>;
}
