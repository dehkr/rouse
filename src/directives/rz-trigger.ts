import { parseTriggers } from '../core/parser';
import { attachPoll, getDirectiveValue, hasDirective } from '../core/shared';
import { is, on } from '../dom/utils';
import type { Directive, DirectiveSlug } from '../types';

const SLUG = 'trigger' as const satisfies DirectiveSlug;

export const rzTrigger = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  attachTriggers,
} as const satisfies Directive;

/**
 * Attach event listeners and handle synthetic `poll` and `none` events.
 * Returns a cleanup function or `undefined` if 0 triggers.
 */
function attachTriggers(el: Element, action: (e?: Event) => void) {
  const triggers = parseTriggers(getDirectiveValue(el, SLUG));
  if (triggers.length === 0) return;

  const cleanups: Array<() => void> = [];

  triggers.forEach((trigger) => {
    if (trigger.event === 'load') {
      action();
    }

    // Handle synthetic poll event
    else if (trigger.event === 'poll') {
      const stop = attachPoll(trigger.modifiers, action);
      if (stop) cleanups.push(stop);
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
