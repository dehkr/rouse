import type { RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { applyTiming, parseTime } from '../core/timing';
import { effect } from '../reactivity';
import type { Directive, DirectiveSlug } from '../types';

const SLUG = 'save' as const satisfies DirectiveSlug;

export const rzSave = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  attachTriggers,
} as const satisfies Directive;

/**
 * Attach event listeners and handles synthetic `poll` and `mutate` event.
 * Returns cleanups.
 */
function attachTriggers(el: Element, storeName: string, app: RouseApp) {
  if (!storeName || !app) return;

  const triggers = parseTriggers(getDirectiveValue(el, SLUG));
  if (triggers.length === 0) return;

  const ac = new AbortController();
  const { signal } = ac;
  const cleanups: Array<() => void> = [() => ac.abort()];

  const triggerSave = () => {
    if (!app.stores.status(storeName)?.loading) {
      app.stores.save(storeName);
    }
  };

  for (const trigger of triggers) {
    // Synthetic 'mutate' event triggers save whenever store data changes
    if (trigger.event === 'mutate') {
      let isInitial = true;

      const save = applyTiming(triggerSave, trigger.modifiers, app.config.timing);
      cleanups.push(() => save.cancel());

      const stopEffect = effect(() => {
        const data = app.stores.get(storeName);
        if (!data) return;

        // Deep-read to register dependencies
        JSON.stringify(data);

        if (isInitial) {
          isInitial = false;
          return;
        }

        save();
      });

      cleanups.push(stopEffect);
    }

    // Synthetic poll event
    else if (trigger.event === 'poll' && trigger.modifiers.length > 0) {
      const ms = parseTime(trigger.modifiers[0]);
      if (ms > 0) {
        const timer = window.setInterval(triggerSave, ms);
        cleanups.push(() => window.clearInterval(timer));
      }
    }

    // Custom DOM events
    else {
      app.root.addEventListener(trigger.event, triggerSave, { signal });
    }
  }

  return () => {
    cleanups.forEach((fn) => {
      fn();
    });
  };
}
