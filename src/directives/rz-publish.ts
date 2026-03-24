import { getApp } from '../core/app';
import { applyTiming } from '../core/timing';
import {
  applyModifiers,
  getListenerOptions,
  resolveListenerTarget,
} from '../dom/modifiers';
import { resolvePayload, splitInjection } from '../dom/utils';
import type { RouseController } from '../types';

export const SLUG = 'publish' as const;

export function attachPublish(
  el: HTMLElement,
  _instance: RouseController,
  evtName: string,
  rawTopic: string,
  modifiers: string[] = [],
): () => void {
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

  target.addEventListener(evtName, handler, options);

  // Return the cleanup
  return () => {
    target.removeEventListener(evtName, handler, options);
    // Cancel pending delayed executions
    pacedPublish.cancel();
  };
}
