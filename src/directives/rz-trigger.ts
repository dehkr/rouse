import { parseDirectiveValue, parseModifiers } from '../core/parser';
import { getDirectiveValue } from '../core/shared';
import type { DirectiveSchema } from '../types';

export const rzTrigger = {
  slug: 'trigger',
  handler: getFetchTriggers,
} as const satisfies DirectiveSchema<HTMLScriptElement>;

type TriggerDef = {
  event: string;
  modifiers: string[];
}

type TriggerMapEntry = {
  rawValue: string;
  triggers: TriggerDef[];
}

const triggerCache = new WeakMap<Element, TriggerMapEntry>();

/**
 * Parses the DOM event triggers and their pacing modifiers for rz-fetch.
 */
export function getFetchTriggers(el: Element): TriggerDef[] {
  const rawValue = getDirectiveValue(el, 'trigger') || '';

  const cached = triggerCache.get(el);
  if (cached && cached.rawValue === rawValue) {
    return cached.triggers;
  }

  const triggers: TriggerDef[] = [];

  if (rawValue) {
    const parsed = parseDirectiveValue(rawValue);

    for (const [key, _val] of parsed) {
      const { key: event, modifiers } = parseModifiers(key);
      if (event) {
        triggers.push({
          event,
          modifiers,
        });
      }
    }
  }

  triggerCache.set(el, { rawValue, triggers });

  return triggers;
}
