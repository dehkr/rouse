import { getApp } from '../core/app';
import { parseDirective } from '../dom/parser';
import { effect } from '../reactivity';
import { getDirective } from './prefix';

export const SLUG = 'autosave' as const;

export function attachAutosave(el: HTMLScriptElement) {
  const app = getApp(el);
  if (!app) return;

  const storeName = getDirective(el, 'store');
  const raw = getDirective(el, SLUG);

  if (!storeName || !raw) return;

  const parsed = parseDirective(raw);
  let url = '';
  let method = 'POST';
  let debounce = 500;

  for (const [key, val] of parsed) {
    if (key === 'debounce') {
      debounce = parseInt(val, 10) || 500;
    } else if (!url) {
      method = val ? key.toUpperCase() : 'POST';
      url = val || key;
    }
  }

  // Register the URL globally
  if (url) {
    app.stores._setConfig(storeName, { url, saveMethod: method });
  }

  let timeout: number;
  let isInitial = true;

  const stopEffect = effect(() => {
    const data = app.stores.get(storeName);
    if (!data) return;

    // Deep-read the proxy to register all nested dependencies
    JSON.stringify(data);

    // Skip the first run when the store is initialized
    if (isInitial) {
      isInitial = false;
      return;
    }

    clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      app.stores.save(storeName, url ? { url, method } : undefined);
    }, debounce);
  });

  return () => {
    clearTimeout(timeout);
    if (typeof stopEffect === 'function') {
      stopEffect();
    }
  };
}
