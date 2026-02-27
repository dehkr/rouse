import { getApp } from '../core/app';
import { attachAutosave, attachRefresh, cleanupFetch, processWake } from '../directives';
import { getDirective, hasDirective, selector } from '../directives/prefix';
import { mountInstance, unmountInstance } from '../dom/controller';
import { isElement, resolvePayload, splitInjection } from './utils';

const storeCleanups = new WeakMap<HTMLScriptElement, Array<() => void>>();

/**
 * Initializes a controller element by parsing its directive, resolving its
 * setup function from the registry, and mounting the reactive instance.
 * Honors the specified `wake` strategy before executing the mount.
 *
 * @param el - The DOM element containing the `rz-use` directive.
 * @param defaultWake - The fallback wake strategy if the element doesn't specify one.
 */
export function initControllerElement(el: HTMLElement, defaultWake: string) {
  const app = getApp(el);
  if (!app) return;

  const raw = getDirective(el, 'use');
  if (!raw) return;

  const { key: name, rawPayload } = splitInjection(raw);

  const setup = app.registry.get(name);
  if (!setup) {
    console.warn(`[Rouse] Controller "${name}" is not registered.`);
    return;
  }

  processWake(el, defaultWake, () => {
    // Lazy JSON parse
    const props = resolvePayload(rawPayload) || {};
    mountInstance(el, setup, props);
  });
}

/**
 * Bootstraps a global reactive store from a `<script>` tag.
 * Initializes the reactive data registry and attaches any declared
 * networking behaviors (`rz-autosave`, `rz-refresh`).
 *
 * @param script - The `<script>` element containing the JSON state and directives.
 */
export function initStoreElement(script: HTMLScriptElement) {
  if (storeCleanups.has(script)) return;

  const app = getApp(script);
  if (!app) return;

  app.stores.initScript(script);

  const cleanups: Array<() => void> = [];

  // Attach behaviors and save their cleanup functions
  const autoCleanup = attachAutosave(script);
  if (autoCleanup) {
    cleanups.push(autoCleanup);
  }

  const refreshCleanup = attachRefresh(script);
  if (refreshCleanup) {
    cleanups.push(refreshCleanup);
  }

  storeCleanups.set(script, cleanups);
}

/**
 * Safely tears down side-effects associated with a removed store `<script>`.
 * Note: This does not delete the store's data from the global registry.
 *
 * @param script - The `<script>` element that was removed from the DOM.
 */
export function cleanupStoreElement(script: HTMLScriptElement) {
  const cleanups = storeCleanups.get(script);
  if (cleanups) {
    cleanups.forEach((cleanup) => {
      cleanup();
    });
    storeCleanups.delete(script);
  }
}

/**
 * Creates and returns a MutationObserver that watches for new controller (rz-use)
 * and store (rz-store) `<script>` elements. Also handles cleanup for rz-fetch polling
 * timers.
 *
 * @param wake - The framework-level default wake strategy.
 * @returns A configured, unstarted MutationObserver instance.
 */
export function initObserver(wake: string) {
  const sel = selector('use');
  const storeSel = `script${selector('store')}`;
  const fetchSel = selector('fetch');

  const qsa = <T extends Element>(el: Element, s: string): NodeListOf<T> =>
    el.querySelectorAll(s) as NodeListOf<T>;

  return new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      // Added
      m.addedNodes.forEach((node) => {
        if (isElement(node)) {
          // Check for stores
          if (node.tagName === 'SCRIPT' && hasDirective(node, 'store')) {
            initStoreElement(node as HTMLScriptElement);
          }
          qsa<HTMLScriptElement>(node, storeSel).forEach(initStoreElement);

          // Check for controllers
          if (hasDirective(node, 'use')) {
            initControllerElement(node, wake);
          }
          qsa<HTMLElement>(node, sel).forEach((el) => {
            initControllerElement(el, wake);
          });
        }
      });

      // Removed
      m.removedNodes.forEach((node) => {
        if (isElement(node)) {
          // Cleanup removed store scripts
          if (node.tagName === 'SCRIPT' && hasDirective(node, 'store')) {
            cleanupStoreElement(node as HTMLScriptElement);
          }
          qsa<HTMLScriptElement>(node, storeSel).forEach(cleanupStoreElement);

          // Cleanup removed controllers
          if (hasDirective(node, 'use')) {
            unmountInstance(node);
          }
          qsa<HTMLElement>(node, sel).forEach(unmountInstance);

          // Actively garbage collect fetch polling timers
          if (hasDirective(node, 'fetch')) {
            cleanupFetch(node);
          }
          qsa<HTMLElement>(node, fetchSel).forEach(cleanupFetch);
        }
      });
    });
  });
}
