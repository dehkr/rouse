import type { RouseApp } from '../core/app';
import type { PatchAction } from '../core/constants';
import {
  looksLikeStoreSubject,
  parseStoreSubject,
  parseTriggerSubjectPairs,
} from '../core/parser';
import { getDirectiveValue, hasDirective, warn } from '../core/shared';
import { resolveTarget } from '../core/store';
import { applyTiming } from '../core/timing';
import { dispatchTrigger } from '../dom/scheduler';
import { defaultTriggerFor } from '../dom/utils';
import { resolveRequestConfig } from '../net/request';
import type { DirectiveSlug, ManagerDirective, TriggerDef, VoidFn } from '../types';

const SLUG = 'save' as const satisfies DirectiveSlug;
const cleanups = new WeakMap<Element, Array<VoidFn>>();

/**
 * Resolves the merged request config from the trigger and target elements
 * and dispatches the save through the store manager. Bails when the target
 * store isn't registered or already has a request in flight.
 */
function triggerSave(
  triggerEl: Element,
  app: RouseApp,
  storeName: string,
  nestedPath: string,
  action?: PatchAction,
) {
  const status = app.stores.status(storeName);
  if (!status) {
    warn(`Cannot save: store '${storeName}' not found.`);
    return;
  }
  if (status.loading) return;

  const targetEl = app.stores.elementFor(storeName);
  const overrides = resolveRequestConfig(triggerEl, 'save', app, targetEl);

  app.stores.save(storeName, { overrides, nestedPath, action });
}

/**
 * Manager entry for `rz-save`. Parses each `[trigger]: [[action] @store[.path]]`
 * pair from the attribute value and wires the trigger to fire a save against
 * the resolved target. The synthetic `mutate` event fires whenever the target
 * store's data changes, paced by any modifiers on the trigger.
 */
function initialize(el: Element, app: RouseApp) {
  if (cleanups.has(el)) return;

  const value = getDirectiveValue(el, SLUG);
  if (value === null) return;

  const pairs = parseTriggerSubjectPairs(value, looksLikeStoreSubject);
  if (pairs.length === 0) return;

  const teardowns: VoidFn[] = [];

  for (const { trigger, subject } of pairs) {
    const { action, target } = parseStoreSubject(subject);
    const resolved = resolveTarget(el, 'save', target ?? null);
    if (!resolved) continue;

    const { storeName, nestedPath } = resolved;
    const fire = () => triggerSave(el, app, storeName, nestedPath, action);

    // `mutate` is a reactive synthetic event that needs to be handled separately
    if (trigger?.event === 'mutate') {
      teardowns.push(attachMutateEffect(app, storeName, trigger.modifiers, fire));
      continue;
    }

    const resolvedTrigger = trigger ?? {
      event: defaultTriggerFor(el),
      modifiers: [],
    };

    const cleanup = dispatchTrigger(resolvedTrigger, { el, app, action: fire });
    if (cleanup) teardowns.push(cleanup);
  }

  if (teardowns.length > 0) {
    cleanups.set(el, teardowns);
  }
}

function teardown(el: Element) {
  cleanups.get(el)?.forEach((fn) => fn());
  cleanups.delete(el);
}

/**
 * Reactive 'mutate' event — fires `triggerSave` whenever the store data changes.
 */
function attachMutateEffect(
  app: RouseApp,
  storeName: string,
  modifiers: TriggerDef['modifiers'],
  fire: VoidFn,
): VoidFn {
  const debouncedFire = applyTiming(fire, modifiers, app.config.timing);
  const stopListener = app.stores.onMutate(storeName, debouncedFire);
  
  return () => {
    debouncedFire.cancel();
    stopListener();
  };
}

/**
 * Definition for the `rz-save` directive. Wires events to push
 * local store state to the server.
 *
 * Each segment is `[trigger]: [[action] @store[.path]]`. The action token
 * (`replace` or `merge`) overrides the store-configured patch strategy for
 * the response patch on this trigger only. When the subject is omitted, the
 * directive targets the `rz-store` on the same element.
 */
export const rzSave = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  initialize,
  teardown,
} as const satisfies ManagerDirective;
