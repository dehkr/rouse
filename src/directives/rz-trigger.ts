import { parseDirective } from '../core/parser';
import { getDirective } from './prefix';

export const SLUG = 'trigger' as const;

export interface TriggerDef {
  event: string;
  modifiers: string[];
}

const triggerCache = new WeakMap<HTMLElement, { raw: string; triggers: TriggerDef[] }>();

/**
 * Parses the DOM event triggers and their pacing modifiers for rz-fetch.
 */
export function getFetchTriggers(el: HTMLElement): TriggerDef[] {
  const raw = getDirective(el, SLUG) || '';

  const cached = triggerCache.get(el);
  if (cached && cached.raw === raw) {
    return cached.triggers;
  }

  const triggers: TriggerDef[] = [];

  if (raw) {
    const parsed = parseDirective(raw, true);

    for (const [key, _val, modifiers] of parsed) {
      if (key) {
        triggers.push({
          event: key,
          modifiers: modifiers || [],
        });
      }
    }
  }

  triggerCache.set(el, { raw, triggers });
  return triggers;
}
