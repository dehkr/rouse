import type { RouseApp } from '../core/app';
import {
  DEFAULT_PLACE_POSITION,
  isPlacePosition,
  PLACE_POSITIONS,
  type PlacePosition,
} from '../core/constants';
import { warn } from '../core/diagnostics';
import { dispatch } from '../core/dispatch';
import { queryPlaceTargets } from '../directives/rz-place';
import type { PlaceOptions } from '../types';

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
    __DEV__ &&
      warn(`Targets in app.place() must be an element or a selector. Got '${target}'.`);
  }

  let placed = false;
  for (const el of targets) {
    if (placeInto(el, content, position, 'programmatic')) {
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
  content: string,
  position: PlacePosition,
  source: 'fetch' | 'sse' | 'programmatic',
): boolean {
  const dispatcherEl =
    position === 'outerHTML' || position === 'delete'
      ? target.parentElement || target
      : target;

  const beforeEvent = dispatch(
    dispatcherEl,
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

  dispatch(dispatcherEl, 'rz:dom:place', {
    target,
    position,
    payload: finalContent,
    source,
  });

  return true;
}
