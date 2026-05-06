import type { RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import type { ConfigDirective, DirectiveSlug, TriggerDef } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'wake' as const satisfies DirectiveSlug;

export const rzWake = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
} as const satisfies ConfigDirective<TriggerDef[]>;

// =======================================================================================

function getConfig(el: Element, app: RouseApp): TriggerDef[] {
  const strategies = parseTriggers(getDirectiveValue(el, SLUG));
  if (strategies.length === 0) {
    return [{ event: app.config.ui.wakeStrategy, modifiers: [] }];
  }

  return strategies;
}
