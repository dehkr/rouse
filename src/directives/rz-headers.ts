import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { resolveProps } from '../core/props';
import { getDirectiveValue, hasDirective, warn } from '../core/shared';
import type { ConfigDirective, DirectiveSlug } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'headers' as const satisfies DirectiveSlug;

export const rzHeaders = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
} as const satisfies ConfigDirective<Record<string, string>>;

// =======================================================================================

/**
 * Parses the `rz-headers` directive to build a record of HTTP headers.
 * Supports entire object injection (`?`, `#`, `@`, `{`) or static key-value pairs. E.g.,
 *
 * - `rz-headers="Tenant: 123"`
 * - `rz-headers="@session.authHeaders"`
 * - `rz-headers="#auth-headers"`
 * - `rz-headers="?Tenant=123"`
 * - `rz-headers='{ "Tenant": 123 }'`
 */
function getConfig(el: Element, app?: RouseApp): Record<string, string> {
  const value = getDirectiveValue(el, SLUG);
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
  const parsed = parseDirectiveValue(value);

  for (const [key, val] of parsed) {
    if (key && val !== undefined) {
      headers[key] = val;
    }
  }

  return headers;
}
