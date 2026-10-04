import type { RouseApp } from '../core/app';
import {
  DEFAULT_PLACE_POSITION,
  isPlacePosition,
  PLACE_POSITIONS,
  type PlacePosition,
} from '../core/constants';
import { warn } from '../core/diagnostics';
import { dispatch } from '../core/dispatch';
import { queryPlaceTargets, rzPlace } from '../directives/rz-place';
import type { PlaceOptions, RoutablePayload } from '../types';

/**
 * Listens to the app root for HTML fetch responses and stream messages, and routes
 * the payloads into DOM targets named by `rz-place` on the originating element, or
 * a server `Rouse-Place` header.
 *
 * A programmatic fetch doesn't have an element, so it doesn't place by default. A server-
 * named target can place the payload, or the caller can place it using `app.place()`. The
 * `triggerEl` option is configurable, however, so a pre-configured element can be
 * triggered remotely.
 *
 * Error responses route only when the server names a target, since `rz-place` is
 * success-only output.
 */
export function initDomRouter(app: RouseApp, signal: AbortSignal) {
  const route = (e: Event, source: 'fetch' | 'sse') => {
    const { detail } = e as CustomEvent<RoutablePayload>;
    const { config, data, placeOverride } = detail;
    const triggerEl = config?.triggerEl;

    // An empty fetch response arrives as `null`. It places only under `Rouse-Place`,
    // where the header itself is the instruction, so a plain 204 leaves the page alone.
    const content = data == null && placeOverride ? '' : data;
    if (typeof content !== 'string') return;
    // Don't route an error response unless the server provides an override
    if (e.type.includes('error') && !placeOverride) return;
    // No originating element means no destination or host for the declarative path
    if (!triggerEl && !placeOverride) return;

    const placements = rzPlace.getConfig(triggerEl ?? app.root, app.root, placeOverride);

    for (const { targets, position } of placements) {
      for (const targetEl of targets) {
        placeInto(targetEl, content, position, source);
      }
    }
  };

  ['rz:fetch:success:html', 'rz:fetch:error:html'].forEach((name) => {
    app.root.addEventListener(name, (e) => route(e, 'fetch'), { signal });
  });

  app.root.addEventListener('rz:sse:message:html', (e) => route(e, 'sse'), { signal });
}

/**
 * Places `content` into `target`, backing `app.place()`. A selector resolves the way
 * `rz-place` resolves it; an unknown position warns and falls back to `innerHTML`.
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
  } else if (__DEV__) {
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
 * and `delete`, since the target itself is replaced or removed.
 *
 * @returns `false` if a listener canceled the placement.
 */
function placeInto(
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
