import { getDirectiveValue } from '../core/attributes';
import { stripQuotes } from '../core/parser';
import type { ConfigDirective } from '../types';

/**
 * A CSS selector for the elements that receive the `rouse-request` class while a
 * request from the host element is in flight. Without it, the host element receives
 * the class itself. Commas belong to the selector, so `#spinner, .label` marks both.
 * Write `null` to apply it to nothing.
 *
 * @example
 * <button data-rz-fetch="click: /save" data-rz-indicator="#spinner">Save</button>
 */
function getConfig(el: Element): string | null | undefined {
  const value = getDirectiveValue(el, 'indicator')?.trim();
  if (!value) return undefined;

  // Checked before stripping quotes, so `'null'` is still a selector
  if (value === 'null') return null;

  return stripQuotes(value) || undefined;
}

export const rzIndicator = { getConfig } as const satisfies ConfigDirective<
  string | null | undefined
>;
