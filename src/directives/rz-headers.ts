import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { resolveProps } from '../core/props';
import { getDirectiveValue, warn } from '../core/shared';
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
  el: Element,
  app?: RouseApp,
): Record<string, string> {
  if (!value) return {};

  // Object injection
  if (value.match(/^[?#@{]/)) {
    const resolvedObject = resolveProps(value, app?.stores, false);
    const headers: Record<string, string> = {};

    if (resolvedObject && typeof resolvedObject === 'object') {
      for (const [k, v] of Object.entries(resolvedObject)) {
        headers[k] = v == null ? '' : String(v);
      }
    } else {
      warn(`rz-headers payload '${value}' does not resolve to an object.`, el);
    }
    return headers;
  }

  // Static key-value pairs
  const headers: Record<string, string> = {};
  for (const [key, val] of parseDirectiveValue(value)) {
    if (!key) continue;
    // Treat unquoted `null` as the deletion sentinel, mirroring programmatic
    // null. Quoted 'null' survives `stripQuotes` and would still be a string here.
    headers[key] = val === 'null' ? '' : val;
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
    getConfig: (el, app) => parseHeadersConfig(getDirectiveValue(el, slug), el, app),
  };
}

export const rzHeaders = defineHeadersDirective('headers');
export const rzSaveHeaders = defineHeadersDirective('save-headers');
export const rzFetchHeaders = defineHeadersDirective('fetch-headers');
export const rzRefreshHeaders = defineHeadersDirective('refresh-headers');
