import { getApp, type RouseApp } from '../core/app';
import { STORE_PREFIX } from '../core/constants';
import { resolveInjection } from '../core/injection';
import { directiveSelector, hasDirective, queryTargets, warn } from '../core/shared';
import { rzFetch, rzPull, rzPush, rzScope, rzStore, rzWake } from '../directives';
import type { ScopeFn } from '../types';
import {
  mountGlobalBinding,
  resolveRemovedOwner,
  teardownGlobalBindings,
  walkBoundElements,
} from './binder';
import { attachWakeStrategies } from './scheduler';
import {
  destroyInstance,
  initScopeInstance,
  scanScopeNode,
  teardownScopeNode,
} from './scope';

/**
 * Initializes a scope element by parsing its directive, resolving its
 * setup function from the registry, and mounting the reactive instance.
 * Honors the specified `wake` strategy before executing the mount.
 *
 * @param el - The DOM element containing the `rz-scope` directive.
 * @param defaultWake - The fallback wake strategy if the element doesn't specify one.
 */
export function initScopeElement(el: HTMLElement, app: RouseApp) {
  const scopeValue = rzScope.getConfig(el);
  if (scopeValue === null) return;

  const { scopeName, rawPayload } = scopeValue;

  let setup: ScopeFn;
  let isAlias = false;

  // Context aliasing for stores
  if (scopeName.startsWith(STORE_PREFIX)) {
    isAlias = true;
    setup = () => {
      // Fetch the live proxy. Must be an object.
      const storeData = resolveInjection(scopeName, app.stores, true);
      return storeData || {};
    };
  } else if (scopeName === '') {
    setup = () => ({});
  } else {
    const scope = app.registry.get(scopeName);
    if (!scope) {
      __DEV__ && warn(`Scope '${scopeName}' is not registered.`);
      return;
    }
    setup = scope;
  }

  const strategies = rzWake.getConfig(el, app);

  attachWakeStrategies(el, strategies, () => {
    // Data can't be passed to an alias so skip `resolveInjection` in that case
    const data = isAlias ? {} : resolveInjection(rawPayload, app?.stores) || {};
    initScopeInstance(el, app, setup, data, { isAlias });
  });
}

/**
 * Creates a MutationObserver scoped to the provided app instance.
 * Watches for new scope, store, and fetch elements. Also handles cleanup
 * for synthetic polling timers and DOM instances.
 *
 * @returns A configured, unstarted MutationObserver instance.
 */
export function initObserver(app: RouseApp) {
  const scopeSelector = directiveSelector('scope');
  const storeSelector = `script${directiveSelector('store')}`;
  const fetchSelector = directiveSelector('fetch');
  const pushSelector = directiveSelector('push');
  const pullSelector = directiveSelector('pull');

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

          // Check for scopes
          queryTargets<HTMLElement>(el, scopeSelector).forEach((el) => {
            // Confirm app ownership in case of nested apps
            if (getApp(el, app)) {
              initScopeElement(el, app);
            }
          });

          // Only scan if it belongs to a scope and isn't a new scope itself
          const ownerScope = el.closest<HTMLElement>(scopeSelector);
          if (
            ownerScope &&
            !hasDirective(el as HTMLElement, 'scope') &&
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
          queryTargets(el, pushSelector).forEach((el) => {
            if (getApp(el, app)) {
              rzPush.initialize(el, app);
            }
          });
          queryTargets(el, pullSelector).forEach((el) => {
            if (getApp(el, app)) {
              rzPull.initialize(el, app);
            }
          });

          // If the newly added element doesn't belong to a scope,
          // walk its tree and auto-mount any bound directives globally.
          if (!ownerScope) {
            walkBoundElements(el, (boundEl) => {
              if (!getApp(boundEl, app)) return;
              mountGlobalBinding(boundEl, app);
            });
          }
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

          // Cleanup scopes
          queryTargets<HTMLElement>(el, scopeSelector).forEach(destroyInstance);

          // Ownership resolved against the scopeBindings WeakMap, not DOM
          // ancestry. Survives detached parents, cross-boundary moves, and
          // sync-detachment edge cases.
          const ownerScope = resolveRemovedOwner(el);
          if (ownerScope && !hasDirective(el, 'scope')) {
            teardownScopeNode(ownerScope, el);
          }

          // Cleanup fetch elements
          queryTargets<HTMLElement>(el, fetchSelector).forEach(rzFetch.teardown);
          queryTargets<HTMLElement>(el, pushSelector).forEach(rzPush.teardown);
          queryTargets<HTMLElement>(el, pullSelector).forEach(rzPull.teardown);

          // Global teardown
          if (!ownerScope) {
            teardownGlobalBindings(el);
          }
        }
      });
    });
  });
}
