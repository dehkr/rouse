import type { RouseApp } from '../core/app';
import { hasDirective, isDisabled } from '../core/attributes';
import { STORE_PREFIX } from '../core/constants';
import { warn } from '../core/diagnostics';
import { parseStoreRef } from '../core/parser';
import { dispatchTrigger } from '../dom/events';
import type { TriggerSubjectPair, VoidFn } from '../types';

/**
 * Binds each `[trigger]: @store` pair to a push or pull. The push `edit`
 * trigger fires on store mutation via the `edit` trigger source; every other
 * trigger routes through `dispatchTrigger`. Returns the cleanups.
 */
export function bindStorePairs(
  op: 'push' | 'pull',
  el: Element,
  app: RouseApp,
  pairs: TriggerSubjectPair[],
): VoidFn[] {
  // Sync requests are shaped by the store, so these are inert here and otherwise silent
  if (__DEV__ && !hasDirective(el, 'fetch') && !hasDirective(el, 'store')) {
    if (hasDirective(el, 'headers')) {
      warn(
        `rz-${op}: data-rz-headers is ignored. Set headers on the store's <script> element.`,
        el,
      );
    }
    if (hasDirective(el, 'request')) {
      warn(`rz-${op}: data-rz-request is ignored. It only applies to rz-fetch.`, el);
    }
    if (hasDirective(el, 'send')) {
      warn(`rz-${op}: data-rz-send is ignored. It only applies to rz-fetch.`, el);
    }
  }

  return pairs.flatMap(({ trigger, subject }) => {
    const storeName = resolveTarget(el, op, subject);
    if (!storeName) return [];

    const isEdit = trigger.event === 'edit';

    const sync = () => triggerStoreSync(op, el, app, storeName);

    // A debounced edit can settle after the value was pushed, reset, or retyped
    // back to the baseline, so the check runs when the timer fires, not when armed.
    // It tests the store being synced, which an `edit` argument naming another
    // store doesn't change.
    const fire = isEdit
      ? () => {
          if (app.stores.isDirty(storeName)) {
            sync();
          }
        }
      : sync;

    return [dispatchTrigger(trigger, { el, app, action: fire })];
  });
}

/**
 * Resolves a push/pull subject into a store name. Every subject names its store.
 */
function resolveTarget(
  el: Element,
  op: 'push' | 'pull',
  subject: string | null,
): string | null {
  if (!subject) {
    __DEV__ &&
      warn(
        `rz-${op}: missing store reference. Name the store, as in 'click: @cart'.`,
        el,
      );
    return null;
  }

  if (!subject.startsWith(STORE_PREFIX)) {
    __DEV__ &&
      warn(`rz-${op}: target '${subject}' must be a store reference (e.g., '@cart').`);
    return null;
  }

  const target = parseStoreRef(subject, op);
  if (!target) {
    return null;
  }

  const { source: storeName, nestedPath } = target;

  if (!storeName) {
    __DEV__ && warn(`rz-${op}: invalid store reference '${subject}'.`);
    return null;
  }

  // A server changes one field by nesting it in its payload, so sync needs no path.
  // Don't add one.
  if (nestedPath) {
    __DEV__ &&
      warn(
        `rz-${op}: '${subject}' names a path, but a store syncs as a whole. Use '@${storeName}'.`,
        el,
      );
    return null;
  }

  return storeName;
}

/**
 * Dispatches a push or pull through the store manager. Bails when the trigger is
 * gone or disabled, when the target store isn't registered, or when the store
 * already has a request in flight, in which case a push may be sent once that request
 * succeeds. Request config comes from the store, not here.
 */
function triggerStoreSync(
  op: 'push' | 'pull',
  triggerEl: Element,
  app: RouseApp,
  storeName: string,
): void {
  // A debounced or queued trigger can fire after the element is gone
  if (!triggerEl.isConnected || isDisabled(triggerEl)) return;

  const status = app.stores.status(storeName);
  if (!status) {
    __DEV__ && warn(`rz-${op}: store '@${storeName}' not found.`, triggerEl);
    return;
  }
  if (status.syncing) {
    // A push that brings something new is sent once the current request succeeds.
    // The follow-up re-enters here, so a trigger gone or disabled by then is still
    // dropped, and its events fire from the element the user acted on.
    if (op === 'push') {
      app.stores._deferPush(storeName, () =>
        triggerStoreSync(op, triggerEl, app, storeName),
      );
    }
    return;
  }

  app.stores[op](storeName, { triggerEl });
}
