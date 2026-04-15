import { parseTriggers } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { parseTime } from '../core/timing';
import { isAnchor, isForm, on } from '../dom/utils';
import type { Directive } from '../types';

export const rzTrigger = {
  existsOn,
  getRawValue,
  attachTriggers,
} as const satisfies Directive;

function existsOn(el: Element) {
  return hasDirective(el, 'trigger');
}

function getRawValue(el: Element) {
  return getDirectiveValue(el, 'trigger');
}

/**
 * Attach event listeners and handle synthetic `poll` and `none` events.
 * Returns a cleanup function or `undefined` if 0 triggers.
 */
function attachTriggers(el: Element, action: (e?: Event) => void) {
  const triggers = parseTriggers(getRawValue(el));
  if (triggers.length === 0) return;
  
  const isFormEl = isForm(el);
  const isAnchorEl = isAnchor(el);
  const cleanups: Array<() => void> = [];

  triggers.forEach((trigger) => {
    if (trigger.event === 'load') {
      action();
    }

    // Handle synthetic poll event
    else if (trigger.event === 'poll') {
      const waitStr = trigger.modifiers[0];
      // TODO: confirm default poll time and add to app config?
      const ms = waitStr ? parseTime(waitStr) : 5000;
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
          // Prevent default behavior for forms and anchor links
          if ((isFormEl && e.type === 'submit') || (isAnchorEl && e.type === 'click')) {
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
