import type { RouseApp } from '../../app';
import { warn } from '../../core/diagnostics';
import { getDirectiveValue } from '../../core/elements';
import type {
  SseCloseReason,
  StandaloneDirective,
  TriggerDef,
  TriggerSubjectPair,
  VoidFn,
} from '../../types';
import { core } from '../core';
import { openStream, type SseRelease } from './engine';

/**
 * Returns the triggers that close the stream `rz-sse` opened on the same element.
 * The first to fire closes it, unlike `rz-wake`'s AND. Inert without `rz-sse`.
 */
function readClose(el: Element): TriggerDef[] {
  return core.parseTriggers(getDirectiveValue(el, 'close'));
}

/**
 * Binds one stream: every trigger sharing the first pair's URL opens it, and the
 * `rz-close` triggers end it. Returns the pairs' cleanups.
 */
function bindSsePairs(el: Element, app: RouseApp, pairs: TriggerSubjectPair[]): VoidFn[] {
  // The URL comes from the subject only, never a store's endpoint or `href`: an
  // `<a href>` to a stream would navigate to it without JS
  const url = pairs[0]?.subject;

  if (!url) {
    if (__DEV__) {
      warn(
        `rz-sse: no URL found. Configure it using data-rz-sse with at least one leading trigger (e.g. data-rz-sse="ready: /events").`,
        el,
      );
    }
    return [];
  }

  // One stream per element: rz-close and rz-place each have one home here, and
  // rz:sse:open fires from one node. A second stream is a second element.
  const shared = pairs.filter((pair) => pair.subject === url);

  if (__DEV__ && shared.length !== pairs.length) {
    warn(`rz-sse: a single element can only carry one stream.`, el);
  }

  // The element's live stream. Unset while closed, so a reopen is a fresh open.
  let release: SseRelease | undefined;

  const open = () => {
    // Repeat triggers on a live stream are a no-op, not a second connection
    if (release) return;
    // A stream that closes for good frees the element, so its next open trigger reconnects
    release =
      openStream(app, url, { triggerEl: el }, () => {
        release = undefined;
      }) ?? undefined;
  };

  const close = (reason: SseCloseReason) => {
    const current = release;
    release = undefined;
    current?.(reason);
  };

  return [
    ...shared.map(({ trigger }) =>
      core.dispatchTrigger(trigger, { el, app, action: open }),
    ),
    ...readClose(el).map((trigger) =>
      core.dispatchTrigger(trigger, { el, app, action: () => close('released') }),
    ),
    // The connection outlives the triggers that opened it, so teardown ends it
    () => close('teardown'),
  ];
}

export const rzSse = {
  slug: 'sse',
  mount: bindSsePairs,
} as const satisfies StandaloneDirective;
