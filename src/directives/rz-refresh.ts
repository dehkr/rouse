import { getApp } from '../core/app';
import { parseDirective } from '../core/parser';
import { getTimingConfig } from '../core/timing';
import { getDirective } from './prefix';

export const SLUG = 'refresh' as const;

export function attachRefresh(el: HTMLScriptElement) {
  const app = getApp(el);
  if (!app) return;

  const storeName = getDirective(el, 'store');
  const raw = getDirective(el, SLUG);

  if (!storeName || !raw) return;

  const parsed = parseDirective(raw);
  const timingModifiers: string[] = [];
  let url = '';
  let method = 'GET';
  let focus = false;
  let reconnect = false;

  for (const [key, val, modifiers] of parsed) {
    if (key === 'focus') {
      focus = true;
    } else if (key === 'reconnect') {
      reconnect = true;
    } else if (['poll', 'debounce', 'throttle', 'timeout'].includes(key)) {
      if (val) {
        console.warn(
          `[Rouse] Invalid syntax for timing behavior '${key}'. Use dot-notation (e.g., 'debounce.500ms') instead of a key-value pair.`,
        );
      }
      timingModifiers.push(key, ...modifiers);
    } else if (!url) {
      method = val ? key.toUpperCase() : 'GET';
      url = val || key;
    }
  }

  // Extract the poll interval if defined
  const timingConfig = getTimingConfig(timingModifiers, app.config.timing);
  const interval = timingConfig.strategy === 'poll' ? timingConfig.wait : 0;

  // Register the URL globally
  if (url) {
    app.stores._setConfig(storeName, { url, refreshMethod: method });
  }

  const triggerRefresh = () => {
    // Only refresh if we aren't already actively saving/loading
    if (!app.stores.status(storeName)?.loading) {
      app.stores.refresh(storeName, url ? { url, method } : undefined);
    }
  };

  if (focus) {
    window.addEventListener('focus', triggerRefresh);
  }
  if (reconnect) {
    window.addEventListener('online', triggerRefresh);
  }

  let timer: number | undefined;
  if (interval > 0) {
    timer = window.setInterval(triggerRefresh, interval);
  }

  // Cleanup
  return () => {
    if (focus) {
      window.removeEventListener('focus', triggerRefresh);
    }
    if (reconnect) {
      window.removeEventListener('online', triggerRefresh);
    }
    if (timer) {
      clearInterval(timer);
    }
  };
}
