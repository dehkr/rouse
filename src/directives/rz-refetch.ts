import { coreStore } from '../core/store';
import { parseDirective } from '../dom/parser';
import { getDirective } from './prefix';

export const SLUG = 'refetch' as const;

export function applyRefetch(el: HTMLScriptElement) {
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

  const triggerPull = () => {
    // Only pull if we aren't already actively syncing/loading
    if (!coreStore._status.get(storeName)?.loading) {
      coreStore.pull(storeName, { url, method });
    }
  };

  if (focus) {
    window.addEventListener('focus', triggerPull);
  }

  if (reconnect) {
    window.addEventListener('online', triggerPull);
  }

  let timer: number | undefined;
  if (interval > 0) {
    timer = window.setInterval(triggerPull, interval);
  }

  // Return the cleanup function
  return () => {
    if (focus) {
      window.removeEventListener('focus', triggerPull);
    }
    if (reconnect) {
      window.removeEventListener('online', triggerPull);
    }
    if (timer) {
      clearInterval(timer);
    }
  };
}
