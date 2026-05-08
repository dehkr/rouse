import { getApp, type RouseApp } from '../core/app';
import { STORE_PREFIX } from '../core/constants';
import { resolveProps } from '../core/props';
import { directiveSelector, queryTargets, warn } from '../core/shared';
import { rzFetch, rzRefresh, rzSave, rzScope, rzStore, rzWake } from '../directives';
import {
  destroyInstance,
  initControllerInstance,
  scanScopeNode,
  teardownScopeNode,
} from '../dom/controller';
import type { ControllerFunction } from '../types';
import { attachWakeStrategies } from './scheduler';

/**
 * Initializes a controller element by parsing its directive, resolving its
 * setup function from the registry, and mounting the reactive instance.
 * Honors the specified `wake` strategy before executing the mount.
 *
 * @param el - The DOM element containing the `rz-scope` directive.
 * @param defaultWake - The fallback wake strategy if the element doesn't specify one.
 */
export function initControllerElement(el: HTMLElement, app: RouseApp) {
  const scopeValue = rzScope.getConfig(el);
  if (scopeValue === null) return;

  const { controllerName, rawPayload } = scopeValue;

  let setup: ControllerFunction;
  let isAlias = false;

  // Context aliasing for stores
  if (controllerName.startsWith(STORE_PREFIX)) {
    isAlias = true;
    setup = () => {
      // Fetch the live proxy. Must be an object.
      const storeData = resolveProps(controllerName, app.stores, true);
      return storeData || {};
    };
  } else if (controllerName === '') {
    setup = () => ({});
  } else {
    const controller = app.registry.get(controllerName);
    if (!controller) {
      warn(`Controller '${controllerName}' is not registered.`);
      return;
    }
    setup = controller;
  }

  const strategies = rzWake.getConfig(el, app);

  attachWakeStrategies(el, strategies, () => {
    // Props can't be passed to an alias so skip `resolveProps` in that case
    const props = isAlias ? {} : resolveProps(rawPayload, app?.stores) || {};
    initControllerInstance(el, app, setup, props, { isAlias });
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
  const saveSelector = directiveSelector('save');
  const refreshSelector = directiveSelector('refresh');

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
            // Confirm app ownership in case of nested apps
            if (getApp(el, app)) {
              initControllerElement(el, app);
            }
          });

          // Only scan if it belongs to a scope and isn't a new scope itself
          const ownerScope = el.closest<HTMLElement>(scopeSelector);
          if (
            ownerScope &&
            !rzScope.existsOn(el as HTMLElement) &&
            getApp(ownerScope, app)
          ) {
            scanScopeNode(ownerScope, el);
          }

          // Check for elements with network directives
          queryTargets(el, fetchSelector).forEach((el) => {
            if (getApp(el, app)) {
              rzFetch.initialize(el, app);
            }
          });
          queryTargets(el, saveSelector).forEach((el) => {
            if (getApp(el, app)) {
              rzSave.initialize(el, app);
            }
          });
          queryTargets(el, refreshSelector).forEach((el) => {
            if (getApp(el, app)) {
              rzRefresh.initialize(el, app);
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
          queryTargets<HTMLElement>(el, saveSelector).forEach(rzSave.teardown);
          queryTargets<HTMLElement>(el, refreshSelector).forEach(rzRefresh.teardown);
        }
      });
    });
  });
}
