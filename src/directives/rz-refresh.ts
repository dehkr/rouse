import { getApp } from '../core/app';
import { parseDirectiveValue, parseModifiers } from '../core/parser';
import { parseTime } from '../core/timing';
import type { DirectiveSchema } from '../types';
import { getDirectiveValue } from './utils';

export const rzRefresh = {
  slug: 'refresh',
  handler: attachRefresh,
} as const satisfies DirectiveSchema<HTMLScriptElement>;

/**
 * Configures store refresh strategy.
 */
export function attachRefresh(el: HTMLScriptElement) {
  const app = getApp(el);
  if (!app) return;

  const storeName = getDirectiveValue(el, 'store');
  const rawValue = getDirectiveValue(el, 'refresh');

  if (!storeName || rawValue === null) return;

  const ac = new AbortController();
  const { signal } = ac;

  // Inherit from global config first
  let focus = app.config.network.refreshOnFocus ?? true;
  let reconnect = app.config.network.refreshOnReconnect ?? true;
  let pollInterval = 0;

  const triggerRefresh = () => {
    if (!app.stores.status(storeName)?.loading) {
      app.stores.refresh(storeName);
    }
  };

  // Layer on specific modifiers or custom events
  if (rawValue.trim() !== '') {
    const parsed = parseDirectiveValue(rawValue);

    for (const [key, _val] of parsed) {
      const { key: event, modifiers } = parseModifiers(key);
      
      if (event === 'focus') {
        focus = true;
      } else if (event === 'reconnect') {
        reconnect = true;
      } else if (event === 'poll' && modifiers.length > 0) {
        pollInterval = parseTime(modifiers[0]);
      } else if (event) {
        // Custom events scoped to the app instance root
        app.root.addEventListener(key, triggerRefresh, { signal });
      }
    }
  }

  // Attach listeners
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

  if (reconnect) {
    window.addEventListener('online', triggerRefresh, { signal });
  }

  let timer: number | undefined;
  if (pollInterval > 0) {
    timer = window.setInterval(triggerRefresh, pollInterval);
  }

  return () => {
    ac.abort();
    if (timer) {
      clearInterval(timer);
    }
  };
}
