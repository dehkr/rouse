import type { RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import type { ConfigDirective, DirectiveSlug, TriggerDef } from '../types';

const SLUG = 'wake' as const satisfies DirectiveSlug;

function getConfig(el: Element, app: RouseApp): TriggerDef[] {
  const wakeTriggers = parseTriggers(getDirectiveValue(el, SLUG));

  if (wakeTriggers.length === 0) {
    // Fall back to the app config, then to 'ready' if the config is malformed.
    const wakeTriggersConfig = parseTriggers(app.config.wake);
    return wakeTriggersConfig.length === 0
      ? [{ event: 'ready', modifiers: [] }]
      : wakeTriggersConfig;
  }

  return wakeTriggers;
}

export const rzWake = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  getConfig,
} as const satisfies ConfigDirective<TriggerDef[]>;
