import type { RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import { attachPoll, getDirectiveValue, hasDirective } from '../core/shared';
import type { Directive, DirectiveSlug } from '../types';

const SLUG = 'refresh' as const satisfies DirectiveSlug;

export const rzRefresh = {
  slug: SLUG,
  existsOn: (el: Element) => hasDirective(el, SLUG),
  getValue: (el: Element) => getDirectiveValue(el, SLUG),
  attachTriggers,
} as const satisfies Directive;

/**
 * Attach event listeners and sets default `focus` and `reconnect` behavior.
 * Also handles synthetic `poll` event and returns cleanups.
 */
function attachTriggers(el: Element, storeName: string, app: RouseApp) {
  if (!storeName || !app) return;

  const ac = new AbortController();
  const { signal } = ac;
  const cleanups: Array<() => void> = [() => ac.abort()];

  // Inherit from global config first
  let focus = app.config.network.refreshOnFocus ?? true;
  let reconnect = app.config.network.refreshOnReconnect ?? true;

  // Optional triggers if provided in rz-refresh
  const triggers = parseTriggers(getDirectiveValue(el, SLUG));

  const triggerRefresh = () => {
    if (!app.stores.status(storeName)?.loading) {
      app.stores.refresh(storeName);
    }
  };

  for (const trigger of triggers) {
    // Check for `focus` and `reconnect` to override global config
    if (trigger.event === 'focus') {
      focus = true;
    } else if (trigger.event === 'reconnect') {
      reconnect = true;
    } else if (trigger.event === 'poll') {
      const stop = attachPoll(trigger.modifiers, triggerRefresh);
      if (stop) cleanups.push(stop);
    } else {
      // Custom events scoped to the app instance root
      app.root.addEventListener(trigger.event, triggerRefresh, { signal });
    }
  }

  // Attach global listener for `focus` event
  if (focus) {
    window.addEventListener('focus', triggerRefresh, { signal });
    window.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'visible') {
          triggerRefresh();
        }
      },
      { signal },
    );
  }
  // Attach global listener for `reconnect` event
  if (reconnect) {
    window.addEventListener('online', triggerRefresh, { signal });
  }

  return () => {
    cleanups.forEach((fn) => {
      fn();
    });
  };
}
