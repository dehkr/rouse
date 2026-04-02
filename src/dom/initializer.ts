import {
  getApp,
  initFetchElement,
  teardownFetchElement,
  type RouseApp,
} from '../core/app';
import { directiveSelector, getDirectiveValue, hasDirective, warn } from '../core/shared';
import { rzAutosave, rzRefresh, rzWake } from '../directives';
import { destroyInstance, initInstance } from '../dom/controller';
import { isElement, resolvePayload, splitInjection } from './utils';

const storeCleanups = new WeakMap<HTMLScriptElement, Array<() => void>>();

/**
 * Initializes a controller element by parsing its directive, resolving its
 * setup function from the registry, and mounting the reactive instance.
 * Honors the specified `wake` strategy before executing the mount.
 *
 * @param el - The DOM element containing the `rz-scope` directive.
 * @param defaultWake - The fallback wake strategy if the element doesn't specify one.
 */
export function initControllerElement(el: HTMLElement, defaultWake: string) {
  const app = getApp(el);
  if (!app) return;

  const raw = getDirectiveValue(el, 'scope');
  if (raw === null) return;

  const { key: name, rawPayload } = splitInjection(raw);

  // Empty setup function gets passed for scopes w/out a controller
  const setup = name === '' ? () => ({}) : app.registry.get(name);

  if (!setup) {
    warn(`Controller "${name}" is not registered.`);
    return;
  }

  rzWake.handler(el, defaultWake, () => {
    // Lazy JSON parse
    const props = resolvePayload(rawPayload, app?.stores) || {};
    initInstance(el, setup, props);
  });
}

/**
 * Bootstraps a global reactive store from a `<script>` tag.
 * Initializes the reactive data registry and attaches any declared
 * networking behaviors (`rz-autosave`, `rz-refresh`, `rz-source`).
 *
 * @param script - The `<script>` element containing the JSON state and directives.
 */
export function initStoreElement(script: HTMLScriptElement) {
  if (storeCleanups.has(script)) return;

  const app = getApp(script);
  if (!app) return;

  app.stores.initScript(script);

  const cleanups: Array<() => void> = [];

  // Configure the store URL if rz-source is present
  const storeName = getDirectiveValue(script, 'store');
  const source = getDirectiveValue(script, 'source');
  if (storeName && source) {
    app.stores.config(storeName, { url: source });
  }

  // Attach behaviors and save their cleanup functions
  const autosaveCleanup = rzAutosave.handler(script);
  if (autosaveCleanup) {
    cleanups.push(autosaveCleanup);
  }

  const refreshCleanup = rzRefresh.handler(script);
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
 * Creates a MutationObserver scoped to the provided app instance.
 * Watches for new controller, store, and fetch elements. Also handles cleanup
 * for synthetic polling timers and DOM instances.
 *
 * @returns A configured, unstarted MutationObserver instance.
 */
export function initObserver(app: RouseApp) {
  const sel = directiveSelector('scope');
  const storeSel = `script${directiveSelector('store')}`;
  const fetchSel = directiveSelector('fetch');
  const wake = app.config.ui.wakeStrategy;

  const qsa = <T extends Element>(el: Element, s: string): NodeListOf<T> =>
    el.querySelectorAll(s) as NodeListOf<T>;

  return new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      // Added
      m.addedNodes.forEach((node) => {
        if (isElement(node)) {
          // Check for stores
          if (
            node.tagName === 'SCRIPT' &&
            hasDirective(node, 'store') &&
            getApp(node) === app
          ) {
            initStoreElement(node as HTMLScriptElement);
          }
          qsa<HTMLScriptElement>(node, storeSel).forEach((script) => {
            if (getApp(script) === app) {
              initStoreElement(script);
            }
          });

          // Check for controllers
          if (hasDirective(node, 'scope') && getApp(node) === app) {
            initControllerElement(node, wake);
          }
          qsa<HTMLElement>(node, sel).forEach((child) => {
            if (getApp(child) === app) {
              initControllerElement(child, wake);
            }
          });

          // Check for new fetch elements to bind polling/custom triggers
          if (hasDirective(node, 'fetch') && getApp(node) === app) {
            initFetchElement(node as HTMLElement, app);
          }
          qsa<HTMLElement>(node, fetchSel).forEach((child) => {
            if (getApp(child) === app) {
              initFetchElement(child, app);
            }
          });
        }
      });

      // Removed
      m.removedNodes.forEach((node) => {
        if (isElement(node)) {
          // Cleanup stores
          if (node.tagName === 'SCRIPT' && hasDirective(node, 'store')) {
            cleanupStoreElement(node as HTMLScriptElement);
          }
          qsa<HTMLScriptElement>(node, storeSel).forEach(cleanupStoreElement);

          // Cleanup controllers
          if (hasDirective(node, 'scope')) {
            destroyInstance(node);
          }
          qsa<HTMLElement>(node, sel).forEach(destroyInstance);

          // Cleanup fetch elements (pacing engines and polling intervals)
          if (hasDirective(node, 'fetch')) {
            teardownFetchElement(node as HTMLElement);
          }
          qsa<HTMLElement>(node, fetchSel).forEach(teardownFetchElement);
        }
      });
    });
  });
}
