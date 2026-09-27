import type { RouseApp } from '../core/app';
import {
  DEFAULT_PLACE_POSITION,
  isPlacePosition,
  PLACE_POSITIONS,
  type PlacePosition,
} from '../core/constants';
import { warn } from '../core/diagnostics';
import { dispatch } from '../core/dispatch';
import { rzPlace } from '../directives';
import type { RoutablePayload } from '../types';

/**
 * Listens to the app root for HTML fetch responses and stream messages, and routes
 * the payloads into DOM targets named by `rz-place` on the originating element, or
 * a server `Rouse-Target` header.
 *
 * A programmatic fetch doesn't have an element, so it doesn't place by default. A server-
 * named target can place the payload, or the caller can place it using `swap()`. The
 * `triggerEl` option is configurable, however, so a pre-configured element can be
 * triggered remotely.
 *
 * Error responses route only when the server names a target, since `rz-place` is
 * success-only output.
 */
export function initDomRouter(app: RouseApp, signal: AbortSignal) {
  const route = (e: Event, source: 'fetch' | 'sse') => {
    const { detail } = e as CustomEvent<RoutablePayload>;
    const { config, data, targetOverride } = detail;
    const triggerEl = config?.triggerEl;

    // An empty response (`null`) or non-string body has nothing to place
    if (typeof data !== 'string') return;
    // Don't route an error response unless the server provides an override
    if (e.type.includes('error') && !targetOverride) return;
    // No originating element means no destination or host for the declarative path
    if (!triggerEl && !targetOverride) return;

    const placements = rzPlace.getConfig(triggerEl ?? app.root, app.root, targetOverride);

    for (const { targets, position } of placements) {
      for (const targetEl of targets) {
        swap(data, targetEl, position, source);
      }
    }
  };

  ['rz:fetch:success:html', 'rz:fetch:error:html'].forEach((name) => {
    app.root.addEventListener(name, (e) => route(e, 'fetch'), { signal });
  });

  app.root.addEventListener('rz:sse:message:html', (e) => route(e, 'sse'), { signal });
}

/**
 * Places HTML content into a target element, replaces it, or removes it.
 *
 * Fires a cancelable `rz:dom:place:before` event first; a listener can cancel it to
 * skip the placement, or mutate `detail.payload` to change what gets written. A
 * `rz:dom:place` event follows. For `outerHTML` and `delete`, both events fire from the
 * target's parent, since the target itself is replaced or removed.
 *
 * @param content - The HTML string to place (ignored for `delete`).
 * @param target - The element to place into, replace, or remove.
 * @param position - Where to place the content: `innerHTML`, `outerHTML`, `delete`, or an `insertAdjacentHTML` position such as `beforeend`. The names are case-sensitive; `innerHTML` is both the default and the fallback for an unrecognized value.
 * @param source - Marks the placement as `fetch`-driven or `programmatic` (default); surfaced on both lifecycle events.
 */
export function swap(
  content: string,
  target: Element,
  position: PlacePosition = 'innerHTML',
  source: 'fetch' | 'sse' | 'programmatic' = 'programmatic',
) {
  const resolved = isPlacePosition(position) ? position : DEFAULT_PLACE_POSITION;
  __DEV__ &&
    resolved !== position &&
    warn(
      `Unknown position '${position}'. Using '${DEFAULT_PLACE_POSITION}'. Positions are case-sensitive: ${PLACE_POSITIONS.join(', ')}.`,
      target,
    );

  const dispatcherEl =
    resolved === 'outerHTML' || resolved === 'delete'
      ? target.parentElement || target
      : target;

  const beforeEvent = dispatch(
    dispatcherEl,
    'rz:dom:place:before',
    { target, position: resolved, payload: content, source },
    { cancelable: true },
  );

  if (beforeEvent.defaultPrevented) return;
  const finalContent = beforeEvent.detail.payload;

  switch (resolved) {
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
      target.insertAdjacentHTML(resolved, finalContent);
  }

  dispatch(dispatcherEl, 'rz:dom:place', {
    target,
    position: resolved,
    payload: finalContent,
    source,
  });
}
