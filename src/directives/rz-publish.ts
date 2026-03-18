import { getApp } from '../core/app';
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

  const handler = (e: Event) => {
    if (!applyModifiers(e, el, modifiers)) return;

    const app = getApp(el);

    let payload: unknown;

    if (rawPayload !== undefined) {
      // Use explicit payload if provided: @store, {json}, ?query, #id
      payload = resolvePayload(rawPayload, app?.stores);
    } else if (e instanceof CustomEvent && e.detail && 'data' in e.detail) {
      // Capture data from event (like rz:fetch:success:json)
      payload = e.detail.data;
    }
    
    if (app) {
      app.bus.publish(topic, payload);
    }
  };

  target.addEventListener(evtName, handler, options);

  // Return the cleanup
  return () => target.removeEventListener(evtName, handler, options);
}
