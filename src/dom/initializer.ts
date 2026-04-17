import { getApp, type RouseApp } from '../core/app';
import { resolveProps } from '../core/props';
import { directiveSelector, queryTargets, warn } from '../core/shared';
import { rzFetch, rzScope, rzStore, rzWake } from '../directives';
import {
  destroyInstance,
  initInstance,
  scanScopeNode,
  teardownScopeNode,
} from '../dom/controller';

/**
 * Initializes a controller element by parsing its directive, resolving its
 * setup function from the registry, and mounting the reactive instance.
 * Honors the specified `wake` strategy before executing the mount.
 *
 * @param el - The DOM element containing the `rz-scope` directive.
 * @param defaultWake - The fallback wake strategy if the element doesn't specify one.
 */
export function initControllerElement(el: HTMLElement) {
  const app = getApp(el);
  if (!app) return;

  const scopeValue = rzScope.getControllerAndPayload(el);
  if (scopeValue === null) return;

  const { controllerName, rawPayload } = scopeValue;

  // Empty setup function gets passed for scopes w/out a controller
  const setup = controllerName === '' ? () => ({}) : app.registry.get(controllerName);

  if (!setup) {
    warn(`Controller '${controllerName}' is not registered.`);
    return;
  }

  rzWake.processStrategy(el, app.config.ui.wakeStrategy, () => {
    // Lazy JSON parse
    const props = resolveProps(rawPayload, app?.stores) || {};
    initInstance(el, setup, props);
  });
}

/**
 * Creates a MutationObserver scoped to the provided app instance.
 * Watches for new controller, store, and fetch elements. Also handles cleanup
 * for synthetic polling timers and DOM instances.
 *
 * @returns A configured, unstarted MutationObserver instance.
 */
export function initObserver(app: RouseApp) {
  const scopeSelector = directiveSelector('scope');
  const storeSelector = `script${directiveSelector('store')}`;
  const fetchSelector = directiveSelector('fetch');

  return new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      // ADDED
      m.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;

          // Check for stores
          queryTargets(el, storeSelector).forEach((el) => {
            if (rzStore.validate(el, app)) {
              rzStore.initialize(el, app);
            }
          });

          // Check for controllers
          queryTargets<HTMLElement>(el, scopeSelector).forEach((el) => {
            if (getApp(el) === app) {
              initControllerElement(el);
            }
          });

          // Only scan if it belongs to a scope and isn't a new scope itself
          const ownerScope = el.closest<HTMLElement>(scopeSelector);
          if (
            ownerScope &&
            !rzScope.existsOn(el as HTMLElement) &&
            getApp(ownerScope) === app
          ) {
            scanScopeNode(ownerScope, el);
          }

          // Check for new fetch elements to bind polling/custom triggers
          queryTargets(el, fetchSelector).forEach((el) => {
            if (getApp(el) === app) {
              rzFetch.initialize(el);
            }
          });
        }
      });

      // REMOVED
      m.removedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;

          // Cleanup stores
          queryTargets<HTMLScriptElement>(el, storeSelector).forEach((el) => {
            rzStore.teardown(el);
          });

          // Cleanup controllers
          queryTargets<HTMLElement>(el, scopeSelector).forEach(destroyInstance);

          // Delegate removed standard elements to their owning controller's teardown
          const ownerScope = el.closest<HTMLElement>(scopeSelector);
          if (ownerScope && !rzScope.existsOn(el as HTMLElement)) {
            teardownScopeNode(ownerScope, el);
          }

          // Cleanup fetch elements
          queryTargets<HTMLElement>(el, fetchSelector).forEach(rzFetch.teardown);
        }
      });
    });
  });
}
