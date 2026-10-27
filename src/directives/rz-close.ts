import { getDirectiveValue } from '../core/attributes';
import { parseTriggers } from '../core/parser';
import type { ConfigDirective, TriggerDef } from '../types';

/**
 * Returns the triggers that close the stream `rz-sse` opened on the same element.
 * The first to fire closes it, unlike `rz-wake`'s AND. Closing releases the element's
 * reference, so the open trigger firing again reopens it.
 *
 * Read on demand by `rz-sse`. Inert if used alone.
 */
function getConfig(el: Element): TriggerDef[] {
  return parseTriggers(getDirectiveValue(el, 'close'));
}

export const rzClose = { getConfig } as const satisfies ConfigDirective<TriggerDef[]>;
