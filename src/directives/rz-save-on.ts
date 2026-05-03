import type { RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { applyTiming } from '../core/timing';
import { dispatchOne } from '../dom/scheduler';
import { effect } from '../reactivity';
import type { DirectiveSlug, TriggerDirective } from '../types';

// ============================== DIRECTIVE DEFINITION ===================================

const SLUG = 'save-on' as const satisfies DirectiveSlug;

export const rzSaveOn = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  attachTriggers,
} as const satisfies TriggerDirective;

// =======================================================================================

/**
 * Attach event listeners and handles synthetic `interval` and `mutate` events.
 */
function attachTriggers(el: Element, app: RouseApp, storeName: string) {
  if (!storeName || !app) return;

  const triggers = parseTriggers(getDirectiveValue(el, SLUG));
  if (triggers.length === 0) return;

  const triggerSave = () => {
    if (!app.stores.status(storeName)?.loading) {
      app.stores.save(storeName);
    }
  };

  const cleanups: Array<() => void> = [];

  for (const trigger of triggers) {
    // Synthetic 'mutate' event triggers save whenever store data changes
    if (trigger.event === 'mutate') {
      cleanups.push(attachMutateEffect(app, storeName, trigger.modifiers, triggerSave));
      continue;
    }

    const cleanup = dispatchOne(trigger, { el, app, action: triggerSave });
    if (cleanup) cleanups.push(cleanup);
  }

  return () => {
    cleanups.forEach((fn) => fn());
  };
}

/**
 * Handle 'mutate' event reactive effects
 */
function attachMutateEffect(
  app: RouseApp,
  storeName: string,
  modifiers: string[],
  triggerSave: () => void,
) {
  let isInitial = true;
  const cleanups: Array<() => void> = [];

  const save = applyTiming(triggerSave, modifiers, app.config.timing);
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

  return () => {
    cleanups.forEach((fn) => fn());
  };
}
