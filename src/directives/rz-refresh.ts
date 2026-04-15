import { RouseApp } from '../core/app';
import { parseTriggers } from '../core/parser';
import { getDirectiveValue, hasDirective } from '../core/shared';
import { parseTime } from '../core/timing';
import type { Directive } from '../types';

export const rzRefresh = {
  existsOn,
  getRawValue,
  attachTriggers,
} as const satisfies Directive<HTMLScriptElement>;

function existsOn(el: HTMLScriptElement) {
  return hasDirective(el, 'refresh');
}

function getRawValue(el: HTMLScriptElement) {
  return getDirectiveValue(el, 'refresh');
}

/**
 * Attach event listeners and sets default `focus` and `reconnect` behavior.
 * Also handles synthetic `poll` event and returns cleanups.
 */
function attachTriggers(el: HTMLScriptElement, storeName: string, app: RouseApp) {
  if (!storeName || !app) return;

  const ac = new AbortController();
  const { signal } = ac;
  const cleanups: Array<() => void> = [() => ac.abort()];

  // Inherit from global config first
  let focus = app.config.network.refreshOnFocus ?? true;
  let reconnect = app.config.network.refreshOnReconnect ?? true;
  let pollInterval = 0;

  // Optional triggers if provided in rz-refresh
  const triggers = parseTriggers(getRawValue(el));

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
    } else if (trigger.event === 'poll' && trigger.modifiers.length > 0) {
      pollInterval = parseTime(trigger.modifiers[0]);
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

  if (pollInterval > 0) {
    const timer = window.setInterval(triggerRefresh, pollInterval);
    cleanups.push(() => window.clearInterval(timer));
  }

  return () => {
    cleanups.forEach((fn) => {
      fn();
    });
  };
}
