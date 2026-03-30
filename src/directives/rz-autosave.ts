import { getApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { applyTiming, parseTime } from '../core/timing';
import { effect } from '../reactivity';
import type { DirectiveSchema } from '../types';
import { getDirectiveValue } from './utils';

export const rzAutosave = {
  slug: 'autosave',
  handler: attachAutosave,
} as const satisfies DirectiveSchema<HTMLScriptElement>;

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export function attachAutosave(el: HTMLScriptElement) {
  const app = getApp(el);
  if (!app) return;

  const storeName = getDirectiveValue(el, 'store');
  const rawValue = getDirectiveValue(el, 'autosave');

  if (!storeName || rawValue == null) return;

  let method = 'POST';
  let wait: number | undefined;

  // Parse order-independent comma-separated values (e.g., "PUT, 500ms")
  if (rawValue) {
    const parsed = parseDirectiveValue(rawValue);
    for (const [key] of parsed) {
      if (!key) continue;

      const upper = key.toUpperCase();
      if (METHODS.has(upper)) {
        method = upper;
      } else {
        // If it's not a method, assume it's a timing string
        const time = parseTime(key);
        if (time > 0) {
          wait = time;
        }
      }
    }
  }

  // Register the method globally for the store
  app.stores._setConfig(storeName, { saveMethod: method });

  let isInitial = true;

  const save = applyTiming(
    () => {
      app.stores.save(storeName, { method });
    },
    ['debounce'],
    {
      ...app.config.timing,
      // Prioritize the custom wait time, fallback to global autosaveWait
      debounceWait: wait ?? app.config.timing.autosaveWait,
    },
  );

  // Bind the effect to watch for store changes
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
