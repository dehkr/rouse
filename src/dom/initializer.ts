import { getApp, type RouseApp } from '../core/app';
import { STORE_PREFIX } from '../core/constants';
import { warn } from '../core/diagnostics';
import { resolveInjection } from '../core/injection';
import { directiveSelector, hasDirective, queryTargets } from '../core/shared';
import { rzFetch, rzPull, rzPush, rzScope, rzStore, rzWake } from '../directives';
import type { ScopeSetup } from '../types';
import {
  mountGlobalBinding,
  resolveRemovedOwner,
  teardownGlobalBindings,
  walkBoundElements,
} from './binder';
import { attachWakeStrategies } from './events';
import {
  destroyInstance,
  initScopeInstance,
  scanScopeNode,
  teardownScopeNode,
} from './scope';

/**
 * Initializes a scope element by parsing its directive, resolving its
 * setup function from the registry, and mounting the reactive instance.
 */
export function initScopeElement(el: HTMLElement, app: RouseApp) {
  const scopeValue = rzScope.getConfig(el);
  if (scopeValue === null) return;

  const { scopeName, rawPayload } = scopeValue;

  let setup: ScopeSetup;
  let isAlias = false;

  // This enables alias scopes (context aliasing for stores). Makes a store,
  // or a nested slice of one, the scope instance directly.
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
      __DEV__ && warn(`Scope '${scopeName}' is not defined.`);
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
  const networkDirectives = [rzFetch, rzPush, rzPull].map(
    (directive) => [directive, directiveSelector(directive.slug)] as const,
  );

  return new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      // ADDED
      m.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;

          queryTargets(el, storeSelector).forEach((el) => {
            if (rzStore.validate(el, app)) {
              rzStore.initialize(el, app);
            }
          });

          queryTargets<HTMLElement>(el, scopeSelector).forEach((el) => {
            // Confirm app ownership in case of nested apps
            if (getApp(el, app)) {
              initScopeElement(el, app);
            }
          });

          // Only scan if it belongs to a scope and isn't a new scope itself
          const ownerScope = el.closest<HTMLElement>(scopeSelector);
          if (ownerScope && !hasDirective(el, 'scope') && getApp(ownerScope, app)) {
            scanScopeNode(ownerScope, el);
          }

          // Network directives: rzFetch, rzPush, rzPull
          for (const [directive, selector] of networkDirectives) {
            queryTargets(el, selector).forEach((el) => {
              if (getApp(el, app)) {
                directive.initialize(el, app);
              }
            });
          }

          // If the newly added element doesn't belong to a scope, walk its
          // tree and auto-mount any bound directives globally.
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

          queryTargets<HTMLScriptElement>(el, storeSelector).forEach((el) => {
            rzStore.teardown(el);
          });

          queryTargets<HTMLElement>(el, scopeSelector).forEach(destroyInstance);

          // Ownership resolved against the `scopeBindings` WeakMap, not DOM
          // ancestry. Survives detached parents, cross-boundary moves, and
          // sync-detachment edge cases.
          const ownerScope = resolveRemovedOwner(el);
          if (ownerScope && !hasDirective(el, 'scope')) {
            teardownScopeNode(ownerScope, el);
          }

          // Network directives: rzFetch, rzPush, rzPull
          for (const [directive, selector] of networkDirectives) {
            queryTargets<HTMLElement>(el, selector).forEach(directive.teardown);
          }

          if (!ownerScope) {
            teardownGlobalBindings(el);
          }
        }
      });
    });
  });
}
