import type { RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { dispatchTriggers } from '../dom/scheduler';
import type { DirectiveSlug, TriggerDirective } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'refresh-on' as const satisfies DirectiveSlug;

export const rzRefreshOn = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  attachTriggers,
} as const satisfies TriggerDirective;

// =======================================================================================

function attachTriggers(el: Element, app: RouseApp, storeName: string) {
  if (!storeName || !app) return;

  const triggers = parseTriggers(getDirectiveValue(el, SLUG));
  if (triggers.length === 0) return;

  const triggerRefresh = () => {
    if (!app.stores.status(storeName)?.loading) {
      app.stores.refresh(storeName);
    }
  };

  const cleanups = dispatchTriggers(triggers, { el, app, action: triggerRefresh });
  return () => cleanups.forEach((fn) => fn());
}
