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
  const timingModifiers: string[] = [];
  let url = '';
  let method = 'POST';

  for (const [key, val, modifiers] of parsed) {
    if (['debounce', 'throttle', 'poll', 'timeout'].includes(key)) {
      if (val) {
        console.warn(
          `[Rouse] Invalid syntax for timing behavior '${key}'. Use dot-notation (e.g., 'debounce.500ms') instead of a key-value pair.`,
        );
      }
      timingModifiers.push(key, ...modifiers);
    } else if (!url) {
      method = val ? key.toUpperCase() : 'POST';
      url = val || key;
    }
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
    timingModifiers,
    app.config.timing,
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
