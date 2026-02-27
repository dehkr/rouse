import { getApp } from '../core/app';
import { parseDirective } from '../dom/parser';
import { getDirective } from './prefix';

export const SLUG = 'refresh' as const;

export function attachRefresh(el: HTMLScriptElement) {
  const app = getApp(el);
  if (!app) return;

  const storeName = getDirective(el, 'store');
  const raw = getDirective(el, SLUG);

  if (!storeName || !raw) return;

  const parsed = parseDirective(raw);
  let url = '';
  let method = 'GET';
  let focus = false;
  let reconnect = false;
  let interval = 0;

  for (const [key, val] of parsed) {
    if (key === 'focus') focus = true;
    else if (key === 'reconnect') reconnect = true;
    else if (key === 'interval') interval = parseInt(val, 10) || 0;
    else if (!url) {
      method = val ? key.toUpperCase() : 'GET';
      url = val || key;
    }
  }

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
