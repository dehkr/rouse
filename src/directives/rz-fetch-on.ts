import type { RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { dispatchTriggers } from '../dom/scheduler';
import type { DirectiveSlug, TriggerDirective } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'fetch-on' as const satisfies DirectiveSlug;

export const rzFetchOn = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  attachTriggers,
} as const satisfies TriggerDirective;

// =======================================================================================

/**
 * Attach event listeners to trigger a fetch request configured by `rz-fetch`.
 */
function attachTriggers(el: Element, app: RouseApp, action: (e?: Event) => void) {
  const triggers = parseTriggers(getDirectiveValue(el, SLUG));
  if (triggers.length === 0) return;

  const cleanups = dispatchTriggers(triggers, { el, app, action });

  return () => cleanups.forEach((fn) => fn());
}
