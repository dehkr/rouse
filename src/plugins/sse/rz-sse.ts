import type { RouseApp } from '../../app';
import { warn } from '../../core/diagnostics';
import type {
  SseCloseReason,
  StandaloneDirective,
  TriggerSubjectPair,
  VoidFn,
} from '../../types';
import { core } from '../core';
import { openStream, type SseRelease } from './engine';
import { rzClose } from './rz-close';

/** The element's live stream. Absent while closed, so a reopen is a fresh open. */
const activeStreams = new WeakMap<Element, SseRelease>();

function openFor(el: Element, app: RouseApp, url: string) {
  // Repeat triggers on a live stream are a no-op, not a second connection
  if (activeStreams.has(el)) return;

  const release = openStream(app, url, { triggerEl: el });
  if (release) {
    activeStreams.set(el, release);
  }
}

function closeFor(el: Element, reason: SseCloseReason) {
  const release = activeStreams.get(el);
  if (!release) return;

  activeStreams.delete(el);
  release(reason);
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

  return [
    ...shared.map(({ trigger }) =>
      core.dispatchTrigger(trigger, { el, app, action: () => openFor(el, app, url) }),
    ),
    ...rzClose.getConfig(el).map((trigger) =>
      core.dispatchTrigger(trigger, {
        el,
        app,
        action: () => closeFor(el, 'released'),
      }),
    ),
    // The connection outlives the triggers that opened it, so teardown ends it
    () => closeFor(el, 'teardown'),
  ];
}

let directive: StandaloneDirective | undefined;

/**
 * Returns the `rz-sse` directive, built once on first install. One object for every
 * app, so its per-element cleanups have one home.
 */
export function rzSse(): StandaloneDirective {
  directive ??= core.defineNetworkOpDirective('sse', bindSsePairs);
  return directive;
}
