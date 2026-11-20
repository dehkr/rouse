import type { RouseApp } from '../app';
import {
  DEFAULT_PLACE_POSITION,
  isPlacePosition,
  PLACE_POSITIONS,
  type PlacePosition,
  type PlaceOperation,
  STORE_PREFIX,
} from '../core/constants';
import { warn } from '../core/diagnostics';
import { dispatchFrom } from '../core/dispatch';
import type { PlaceOptions } from '../types';
import { getDirectiveValue, queryTargets } from '../core/elements';
import { parseDirectiveValue } from '../core/parser';

/**
 * Places `content` into `target`, backing `app.place()`. A selector resolves the way
 * `rz-place` resolves it; an unknown position warns and falls back to `innerHTML`.
 * Never resolve against `document`: on a page with nested apps, the same selector would
 * match different elements here and in `rz-place`.
 *
 * @returns `true` if at least one target received the content.
 */
export function placeContent(
  app: RouseApp,
  target: Element | string,
  content: string,
  options: PlaceOptions = {},
): boolean {
  const requested = options.position ?? DEFAULT_PLACE_POSITION;
  const position = isPlacePosition(requested) ? requested : DEFAULT_PLACE_POSITION;

  if (__DEV__ && position !== requested) {
    warn(
      `Unknown position '${requested}' in app.place(). Using '${DEFAULT_PLACE_POSITION}'. Positions are case-sensitive: ${PLACE_POSITIONS.join(', ')}.`,
    );
  }

  let targets: Element[] = [];
  if (typeof target === 'string') {
    targets = queryPlaceTargets(app.root, target);
  } else if (target instanceof Element) {
    targets = [target];
  } else {
    if (__DEV__) {
      warn(`Targets in app.place() must be an element or a selector. Got '${target}'.`);
    }
  }

  let placed = false;
  for (const el of targets) {
    if (placeInto(el, app.root, content, position, 'programmatic')) {
      placed = true;
    }
  }

  return placed;
}

/**
 * Writes `content` at `position` relative to `target`, between a cancelable
 * `rz:dom:place:before` and `rz:dom:place`. Both fire from the parent for `outerHTML`
 * and `delete`, since the target itself is replaced or removed. Every placement goes
 * through here, routed or programmatic.
 *
 * @returns `false` if a listener canceled the placement.
 */
export function placeInto(
  target: Element,
  root: Element,
  content: string,
  position: PlacePosition,
  source: 'fetch' | 'sse' | 'programmatic',
): boolean {
  const dispatcherEl =
    position === 'outerHTML' || position === 'delete'
      ? target.parentElement || target
      : target;

  const beforeEvent = dispatchFrom(
    dispatcherEl,
    root,
    'rz:dom:place:before',
    { target, position, payload: content, source },
    { cancelable: true },
  );

  if (beforeEvent.defaultPrevented) {
    return false;
  }
  const finalContent = beforeEvent.detail.payload;

  switch (position) {
    case 'delete':
      target.remove();
      break;
    case 'innerHTML':
      target.innerHTML = finalContent;
      break;
    case 'outerHTML':
      target.outerHTML = finalContent;
      break;
    default:
      target.insertAdjacentHTML(position, finalContent);
  }

  dispatchFrom(dispatcherEl, root, 'rz:dom:place', {
    target,
    position,
    payload: finalContent,
    source,
  });

  return true;
}

/**
 * Resolves an `rz-place` value into DOM placement operations: selectors resolved to
 * elements, each with its position.
 *
 * Store targets moved to `rz-deposit`. Multi-target updates are still supported.
 * Commas separate pairs, not selectors, so a selector list sharing one position must
 * be quoted. An empty value defaults to one placement into the host element, and
 * `null` places nothing while the payload's events still fire.
 *
 * - `data-rz-place="afterbegin: #output"`
 * - `data-rz-place="#output"`
 * - `data-rz-place="outerHTML"`
 * - `data-rz-place="beforeend: '#log, #status'"`
 * - `data-rz-place="beforeend: #log, afterbegin: #status"`
 * - `data-rz-place="null"`
 *
 * @param overrideValue - Takes precedence over the element's `rz-place` attribute (a server `Rouse-Place` header).
 */
export function readPlace(el: Element, appRoot: Element, overrideValue?: string | null) {
  const value = overrideValue || getDirectiveValue(el, 'place');

  // Checked before parsing, which strips quotes, so `'null'` is still a selector
  if (value?.trim() === 'null') {
    return [];
  }

  return resolvePlacements(value, el, appRoot, !!overrideValue);
}

function resolvePlacements(
  value: string | null | undefined,
  hostEl: Element,
  appRoot: Element,
  fromOverride: boolean,
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
      if (__DEV__) {
        warn(
          `${placeLabel(fromOverride)}: '${store}' names a store. Use ${fromOverride ? 'Rouse-Deposit' : 'data-rz-deposit'} for store targets.`,
          hostEl,
        );
      }
      continue;
    }

    if (val) {
      const position = isPlacePosition(key) ? key : DEFAULT_PLACE_POSITION;
      if (__DEV__ && position !== key) {
        warn(
          `${placeLabel(fromOverride)}: unknown position '${key}'. Using '${DEFAULT_PLACE_POSITION}'. Positions are case-sensitive: ${PLACE_POSITIONS.join(', ')}.`,
          hostEl,
        );
      }
      placements.push({
        position,
        targets: queryPlaceTargets(appRoot, val, hostEl, fromOverride),
      });
    } else if (isPlacePosition(key)) {
      placements.push({ targets: [hostEl], position: key });
    } else {
      placements.push({
        targets: queryPlaceTargets(appRoot, key, hostEl, fromOverride),
        position: DEFAULT_PLACE_POSITION,
      });
    }
  }

  return placements;
}

/**
 * Resolves a placement selector against every match within `root`, including `root`
 * itself. An invalid selector matches nothing. Shared by `rz-place` and `app.place()`.
 */
export function queryPlaceTargets(
  root: Element,
  selector: string,
  hostEl?: Element,
  fromOverride = false,
): Element[] {
  const targets = queryTargets(root, selector);
  // `app.place()` takes its target and content as strings, so swapped arguments
  // compile. This warning is what catches them.
  if (__DEV__ && targets.length === 0) {
    if (hostEl) {
      warn(`${placeLabel(fromOverride)}: no targets found for '${selector}'.`, hostEl);
    } else {
      warn(`No targets found for '${selector}' in app.place().`);
    }
  }

  return targets;
}

/** Names where a placement value came from, for a warning's label. */
function placeLabel(fromOverride: boolean) {
  return fromOverride ? 'Rouse-Place' : 'rz-place';
}
