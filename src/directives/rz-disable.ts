import { getDirectiveValue } from '../core/attributes';
import { stripQuotes } from '../core/parser';
import type { ConfigDirective } from '../types';

/**
 * Resolves the `rz-disable` directive target for an element.
 *
 * Configures which elements to disable while a request from the host element is in flight.
 * Accepts a CSS selector (e.g., `#name, #email`), or an empty string/attribute to target
 * the host element itself.
 *
 * - Elements already disabled before the request will remain disabled after it completes.
 * - `<form>` elements cannot be disabled natively; target a `<fieldset>` inside the form instead.
 *
 * @example
 * <button data-rz-fetch="click: POST /save" data-rz-disable>Save</button>
 */
function getConfig(el: Element): string | undefined {
  const value = getDirectiveValue(el, 'disable');
  if (value === null) return undefined;

  // An empty string names the host element
  return stripQuotes(value.trim());
}

export const rzDisable = { getConfig } as const satisfies ConfigDirective<
  string | undefined
>;
