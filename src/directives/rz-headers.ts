import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { resolveProps } from '../core/props';
import { getDirectiveValue, hasDirective, warn } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

/**
 * Parses a `rz-headers*` directive value into a header record.
 * Supports object injection (`?`, `#`, `@`, `{`) or static key-value pairs.
 *
 * - `rz-headers="Tenant: 123"`
 * - `rz-headers="@session.authHeaders"`
 * - `rz-headers="#auth-headers"`
 * - `rz-headers="?Tenant=123"`
 * - `rz-headers='{ "Tenant": 123 }'`
 */
export function parseHeadersConfig(
  value: string | null | undefined,
  app?: RouseApp,
): Record<string, string> {
  if (!value) return {};

  // Object injection
  if (value.match(/^[?#@{]/)) {
    const resolvedObject = resolveProps(value, app?.stores, false);
    const headers: Record<string, string> = {};

    if (resolvedObject && typeof resolvedObject === 'object') {
      for (const [k, v] of Object.entries(resolvedObject)) {
        if (v !== undefined && v !== null) {
          headers[k] = String(v);
        }
      }
    } else {
      warn(`rz-headers payload '${value}' did not resolve to an object.`);
    }
    return headers;
  }

  // Static key-value pairs
  const headers: Record<string, string> = {};
  for (const [key, val] of parseDirectiveValue(value)) {
    if (key && val !== undefined) {
      headers[key] = val;
    }
  }

  return headers;
}

/**
 * Factory for `rz-headers` and its variants.
 */
export function defineHeadersDirective(
  slug: DirectiveSlug,
): ConfigDirective<Record<string, string>> {
  return {
    slug,
    existsOn: (el) => hasDirective(el, slug),
    getValue: (el) => getDirectiveValue(el, slug),
    getConfig: (el, app) => parseHeadersConfig(getDirectiveValue(el, slug), app),
  };
}

export const rzHeaders = defineHeadersDirective('headers');
export const rzHeadersSave = defineHeadersDirective('headers-save');
export const rzHeadersFetch = defineHeadersDirective('headers-fetch');
export const rzHeadersRefresh = defineHeadersDirective('headers-refresh');
