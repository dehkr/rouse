import { getApp } from '../core/app';
import { parseModifiers } from '../core/parser';
import { applyTiming } from '../core/timing';
import {
  applyModifiers,
  getListenerOptions,
  resolveListenerTarget,
} from '../dom/modifiers';
import { cleanup, resolvePayload, splitInjection } from '../dom/utils';
import type { CleanupFunction, DirectiveSchema, RouseController } from '../types';

export const rzPublish = {
  slug: 'publish',
  handler: attachPublish,
} as const satisfies DirectiveSchema;

export function attachPublish(
  el: HTMLElement,
  _scope: RouseController,
  rawEvent: string,
  rawTopic: string,
): CleanupFunction {
  const { key: event, modifiers } = parseModifiers(rawEvent);
  const { key: topic, rawPayload } = splitInjection(rawTopic);

  const target = resolveListenerTarget(el, modifiers);
  const options = getListenerOptions(modifiers);

  const app = getApp(el);

  const pacedPublish = applyTiming(
    (payload: any) => app?.bus.publish(topic, payload),
    modifiers,
    app?.config.timing,
  );

  const handler = (e: Event) => {
    // Synchronous event modifiers (.prevent, .stop, key matching)
    if (!applyModifiers(e, el, modifiers)) return;

    let payload: unknown;

    // Synchronous payload resolution (captures state when the event fires)
    if (rawPayload !== undefined) {
      payload = resolvePayload(rawPayload, app?.stores);
    } else if (e instanceof CustomEvent && e.detail && 'data' in e.detail) {
      // Capture data from event (like rz:fetch:success:json)
      payload = e.detail.data;
    }

    pacedPublish(payload);
  };

  target.addEventListener(event, handler, options);

  // Return the cleanup
  return cleanup(() => {
    target.removeEventListener(event, handler, options);
    // Cancel pending delayed executions
    pacedPublish.cancel();
  });
}
