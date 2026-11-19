import { warn } from '../../core/diagnostics';
import type { TriggerSource } from '../../dom/events';
import type { SseMessageDetail } from '../../types';
import { core } from './core';
import { subscribeNamed } from './engine';

/**
 * Fires on a stream message with the named event: `sse-[cart-updated]`.
 * Listens on the element, which hears its own stream and its descendants'.
 * `|root` widens it to every stream in the app.
 *
 * Subscribing is what makes the name observable.
 */
export const sseSource: TriggerSource = {
  attach: ({ el, app, arg: name, options, action }) => {
    if (typeof name !== 'string' || !name) {
      if (__DEV__) {
        warn(
          `The 'sse' trigger requires an event name: 'sse-[cart-updated]' in HTML, or { sse: 'cart-updated' } from app.on.`,
          el,
        );
      }
      return null;
    }

    subscribeNamed(name);

    // Listens on the element unless given `|root`, so a stream's `done` can't close
    // another stream's `rz-close`. Don't move the default to the root. The name is
    // filtered from the detail rather than spelled into an `rz:sse:${name}` event,
    // which would collide with the connection events and lose its modifiers.
    const target = core.resolveListenerTarget(el, options, app);

    const handler = (e: Event) => {
      const { detail } = e as CustomEvent<SseMessageDetail>;
      if (detail.event === name) {
        action(e);
      }
    };

    target.addEventListener('rz:sse:message', handler);

    return () => target.removeEventListener('rz:sse:message', handler);
  },
};
