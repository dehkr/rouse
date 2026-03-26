import { getApp } from '../core/app';
import { parseDirective } from '../core/parser';
import { applyTiming } from '../core/timing';
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
  const [firstSegment] = parsed;
  
  let url = '';
  let method = 'POST';

  if (firstSegment) {
    const [key, val] = firstSegment;
    method = val ? key.toUpperCase() : 'POST';
    url = val || key;
  }

  // Register the URL globally
  if (url) {
    app.stores._setConfig(storeName, { url, saveMethod: method });
  }

  let isInitial = true;

  const save = applyTiming(
    () => {
      app.stores.save(storeName, url ? { url, method } : undefined);
    },
    ['debounce'],
    { ...app.config.timing, debounceWait: app.config.timing.autoSaveWait },
  );

  const stopEffect = effect(() => {
    const data = app.stores.get(storeName);
    if (!data) return;

    // Deep-read to register dependencies
    JSON.stringify(data);

    // Skip the first run when the store is initialized
    if (isInitial) {
      isInitial = false;
      return;
    }

    save();
  });

  return () => {
    save.cancel();
    if (typeof stopEffect === 'function') {
      stopEffect();
    }
  };
}
