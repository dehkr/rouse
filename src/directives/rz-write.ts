import { getDirectiveValue } from '../core/attributes';
import { parseTriggers } from '../core/parser';
import type { ConfigDirective, TriggerDef } from '../types';

/**
 * Returns the triggers that write an `rz-model` element's value back into state.
 * Overrides default triggers provided by `modelDefaultTrigger()`.
 *
 * Read on demand by `rz-model`. Inert if used alone.
 */
function getConfig(el: Element): TriggerDef[] {
  return parseTriggers(getDirectiveValue(el, 'write'));
}

export const rzWrite = { getConfig } as const satisfies ConfigDirective<TriggerDef[]>;
