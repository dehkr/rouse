import {
  getApp,
  initFetchElement,
  teardownFetchElement,
  type RouseApp,
} from '../core/app';
import { directiveSelector, getDirectiveValue, hasDirective, warn } from '../core/shared';
import { rzAutosave, rzRefresh, rzWake } from '../directives';
import {
  destroyInstance,
  initInstance,
  scanScopeNode,
  teardownScopeNode,
} from '../dom/controller';
import { resolvePayload, splitInjection } from './utils';

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

  const qsa = <T extends Element = Element>(el: Element, s: string): T[] =>
    Array.from(el.querySelectorAll<T>(s));

  return new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      // Added
      m.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          // Check for stores
          if (
            el.tagName === 'SCRIPT' &&
            hasDirective(el, 'store') &&
            getApp(el) === app
          ) {
            initStoreElement(el as HTMLScriptElement);
          }
          qsa<HTMLScriptElement>(el, storeSel).forEach((script) => {
            if (getApp(script) === app) {
              initStoreElement(script);
            }
          });

          // Check for controllers
          if (hasDirective(el, 'scope') && getApp(el) === app) {
            initControllerElement(el as HTMLElement, wake);
          }
          qsa<HTMLElement>(el, sel).forEach((child) => {
            if (getApp(child) === app) {
              initControllerElement(child, wake);
            }
          });

          const ownerScope = el.closest<HTMLElement>(sel);

          // Only scan if it belongs to a scope and isn't a new scope itself
          if (ownerScope && !hasDirective(el, 'scope') && getApp(ownerScope) === app) {
            scanScopeNode(ownerScope, el);
          }

          // Check for new fetch elements to bind polling/custom triggers
          if (hasDirective(el, 'fetch') && getApp(el) === app) {
            initFetchElement(el);
          }
          qsa<HTMLElement>(el, fetchSel).forEach((child) => {
            if (getApp(child) === app) {
              initFetchElement(child);
            }
          });
        }
      });

      // Removed
      m.removedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;

          // Cleanup stores
          if (el.tagName === 'SCRIPT' && hasDirective(el, 'store')) {
            cleanupStoreElement(el as HTMLScriptElement);
          }
          qsa<HTMLScriptElement>(el, storeSel).forEach(cleanupStoreElement);

          // Cleanup controllers
          if (hasDirective(el, 'scope')) {
            destroyInstance(el as HTMLElement);
          }
          qsa<HTMLElement>(el, sel).forEach(destroyInstance);

          // Delegate removed standard elements to their owning controller's teardown
          const ownerScope = el.closest<HTMLElement>(sel);
          if (ownerScope && !hasDirective(el, 'scope')) {
            teardownScopeNode(ownerScope, el);
          }

          // Cleanup fetch elements (pacing engines and polling intervals)
          if (hasDirective(el, 'fetch')) {
            teardownFetchElement(el);
          }
          qsa<HTMLElement>(el, fetchSel).forEach(teardownFetchElement);
        }
      });
    });
  });
}
