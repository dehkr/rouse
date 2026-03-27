import { getApp } from '../core/app';
import { parseDirective } from '../core/parser';
import { parseTime } from '../core/timing';
import { getDirective } from './prefix';

export const SLUG = 'refresh' as const;

export function attachRefresh(el: HTMLScriptElement) {
  const app = getApp(el);
  if (!app) return;

  const storeName = getDirective(el, 'store');
  const raw = getDirective(el, SLUG);

  if (!storeName || raw === null) return;

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
  if (raw.trim() !== '') {
    const parsed = parseDirective(raw, true);
    for (const [key, _val, modifiers] of parsed) {
      if (key === 'focus') {
        focus = true;
      } else if (key === 'reconnect') {
        reconnect = true;
      } else if (key === 'poll' && modifiers.length > 0) {
        pollInterval = parseTime(modifiers[0]);
      } else if (key) {
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
