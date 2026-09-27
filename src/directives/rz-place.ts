import { getDirectiveValue, queryTargets } from '../core/attributes';
import {
  DEFAULT_PLACE_POSITION,
  isPlacePosition,
  PLACE_POSITIONS,
  type PlaceOperation,
  STORE_PREFIX,
} from '../core/constants';
import { warn } from '../core/diagnostics';
import { parseDirectiveValue } from '../core/parser';
import type { ConfigDirective } from '../types';

/**
 * Resolves an `rz-place` value into DOM placement operations: selectors resolved to
 * elements, each with its position.
 *
 * Store targets moved to `rz-deposit`. Multi-target updates are still supported.
 * Commas separate pairs, not selectors, so a selector list sharing one position must
 * be quoted. An empty value defaults to one placement into the host element.
 *
 * - `data-rz-place="afterbegin: #output"`
 * - `data-rz-place="#output"`
 * - `data-rz-place="outerHTML"`
 * - `data-rz-place="beforeend: '#log, #status'"`
 * - `data-rz-place="beforeend: #log, afterbegin: #status"`
 *
 * @param overrideValue - Takes precedence over the element's `rz-place` attribute (e.g. a server `Rouse-Target` header).
 */
function getConfig(el: Element, appRoot: Element, overrideValue?: string | null) {
  const value = overrideValue || getDirectiveValue(el, 'place');
  return resolvePlacements(value, el, appRoot);
}

function resolvePlacements(
  value: string | null | undefined,
  hostEl: Element,
  appRoot: Element,
): PlaceOperation[] {
  const parsed = value?.trim() ? parseDirectiveValue(value) : [];

  if (parsed.length === 0) {
    // Prevent a store script that hosts an rz-sse stream from inserting HTML
    // payloads by default. It would be inert, but not correct behavior. Doesn't
    // affect explicit rz-place usage.
    if (hostEl instanceof HTMLScriptElement) {
      return [];
    }

    return [{ targets: [hostEl], position: DEFAULT_PLACE_POSITION }];
  }

  const placements: PlaceOperation[] = [];

  // Three forms: 'position: selector', a bare position (targets the host element),
  // or a bare selector (default position).
  for (const [key, val] of parsed) {
    const store = key.startsWith(STORE_PREFIX) ? key : val;
    if (store?.startsWith(STORE_PREFIX)) {
      __DEV__ &&
        warn(
          `rz-place: '${store}' names a store. Use data-rz-deposit for store targets.`,
          hostEl,
        );
      continue;
    }

    if (val) {
      const position = isPlacePosition(key) ? key : DEFAULT_PLACE_POSITION;
      __DEV__ &&
        position !== key &&
        warn(
          `rz-place: unknown position '${key}'. Using '${DEFAULT_PLACE_POSITION}'. Positions are case-sensitive: ${PLACE_POSITIONS.join(', ')}.`,
          hostEl,
        );
      placements.push({ position, targets: queryEls(appRoot, val, hostEl) });
    } else if (isPlacePosition(key)) {
      placements.push({ targets: [hostEl], position: key });
    } else {
      placements.push({
        targets: queryEls(appRoot, key, hostEl),
        position: DEFAULT_PLACE_POSITION,
      });
    }
  }

  return placements;
}

function queryEls(appRoot: Element, selector: string, hostEl: Element): Element[] {
  const targets = queryTargets(appRoot, selector);
  __DEV__ &&
    targets.length === 0 &&
    warn(`rz-place: no targets found for '${selector}'.`, hostEl);

  return targets;
}

export const rzPlace = {
  getConfig,
} as const satisfies ConfigDirective<PlaceOperation[]>;
