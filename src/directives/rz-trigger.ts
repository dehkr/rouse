import { parseTriggers } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { DEFAULT_TIMING, parseTime } from '../core/timing';
import { is, on } from '../dom/utils';
import type { Directive } from '../types';

export const rzTrigger = {
  existsOn: (el: Element) => hasDirective(el, 'trigger'),
  getValue: (el: Element) => getDirectiveValue(el, 'trigger'),
  attachTriggers,
} as const satisfies Directive;

/**
 * Attach event listeners and handle synthetic `poll` and `none` events.
 * Returns a cleanup function or `undefined` if 0 triggers.
 */
function attachTriggers(el: Element, action: (e?: Event) => void) {
  const triggers = parseTriggers(getDirectiveValue(el, 'trigger'));
  if (triggers.length === 0) return;

  const cleanups: Array<() => void> = [];

  triggers.forEach((trigger) => {
    if (trigger.event === 'load') {
      action();
    }

    // Handle synthetic poll event
    else if (trigger.event === 'poll') {
      const waitStr = trigger.modifiers[0];
      const ms = waitStr ? parseTime(waitStr) : DEFAULT_TIMING.POLL;
      if (ms > 0) {
        const timer = window.setInterval(() => {
          action();
        }, ms);
        cleanups.push(() => window.clearInterval(timer));
      }
    }

    // If `none` then skip binding any events
    else if (trigger.event !== 'none') {
      // Attach event listeners for standard or custom events
      const removeListener = on(
        el,
        trigger.event,
        (e: Event) => {
          // Prevent default behavior for forms and links
          if (
            (is(el, 'Form') && e.type === 'submit') ||
            (is(el, 'Anchor') && e.type === 'click')
          ) {
            e.preventDefault();
          }
          action(e);
        },
        trigger.modifiers,
      );
      cleanups.push(removeListener);
    }
  });

  return () => {
    cleanups.forEach((fn) => {
      fn();
    });
  };
}
