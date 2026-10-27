import { getApp, NETWORK_DIRECTIVES, type RouseApp } from '../core/app';
import { hasDirective, queryTargets, unknownDirectiveNames } from '../core/attributes';
import { warn } from '../core/diagnostics';
import { SCOPE_SELECTOR } from '../directives/rz-scope';
import { rzStore } from '../directives/rz-store';
import {
  mountGlobalBinding,
  resolveRemovedOwner,
  teardownGlobalBindings,
  walkBoundElements,
} from './binder';
import {
  destroyInstance,
  initScopeElement,
  scanScopeNode,
  teardownScopeNode,
} from './scope';

/**
 * Warns for each `data-rz-*` attribute in `root`'s subtree, root included, that isn't a
 * directive. An attribute set on an element already in the page, and `<template>`
 * content before it's inserted, go unchecked.
 */
function warnUnknownDirectives(root: Element, app: RouseApp) {
  for (const el of queryTargets(root, '*')) {
    if (!getApp(el, app)) continue;

    unknownDirectiveNames(el).forEach((name) =>
      warn(
        `'${name}' isn't a Rouse directive. The data-rz- prefix is reserved for directives.`,
        el,
      ),
    );
  }
}

/** Runs `fn` on each match of `selector` in `root`'s subtree, root included, that belongs to `app`. */
function forEachOwned<T extends Element>(
  root: Element,
  selector: string,
  app: RouseApp,
  fn: (el: T) => void,
) {
  for (const el of queryTargets<T>(root, selector)) {
    if (getApp(el, app)) {
      fn(el);
    }
  }
}

/**
 * Sets up everything in `root`'s subtree, root included, that belongs to `app`. Stores
 * come first so `@store` references resolve for the rest. Shared by `app.start()` and
 * the observer, so a directive registered here is scanned on both paths.
 *
 * A new standalone directive needs its own selector pass here, in `unmountSubtree`, and
 * in `releaseSubtree`. Sharing another directive's pass misses elements carrying only
 * the new one, without a warning.
 */
export function mountSubtree(root: Element, app: RouseApp) {
  __DEV__ && warnUnknownDirectives(root, app);

  forEachOwned<HTMLScriptElement>(root, rzStore.selector, app, (el) =>
    rzStore.initialize(el, app),
  );

  forEachOwned<HTMLElement>(root, SCOPE_SELECTOR, app, (el) => initScopeElement(el, app));

  const ownerScope = root.closest<HTMLElement>(SCOPE_SELECTOR);

  // Scan elements that belong to a scope, but make sure the element itself
  // isn't a scope. `closest` matches self, so a scope element would scan itself
  // and double-bind (`initScopeElement` already handled it above).
  if (ownerScope && !hasDirective(root, 'scope') && getApp(ownerScope, app)) {
    scanScopeNode(ownerScope, root);
  }

  for (const directive of NETWORK_DIRECTIVES) {
    forEachOwned(root, directive.selector, app, (el) => directive.initialize(el, app));
  }

  // Outside any scope, bound directives mount globally
  if (!ownerScope) {
    walkBoundElements(root, (el) => {
      if (getApp(el, app)) {
        mountGlobalBinding(el, app);
      }
    });
  }
}

/**
 * Tears down the stores, scopes, and network directives in `root`'s subtree, root
 * included. Bound directives are left to the caller, which knows who owns them.
 */
export function unmountSubtree(root: Element) {
  queryTargets<HTMLScriptElement>(root, rzStore.selector).forEach((el) =>
    rzStore.teardown(el),
  );

  queryTargets<HTMLElement>(root, SCOPE_SELECTOR).forEach(destroyInstance);

  for (const directive of NETWORK_DIRECTIVES) {
    queryTargets(root, directive.selector).forEach((el) => directive.teardown(el));
  }
}

/**
 * Tears down what `app` set up in `root`'s subtree, root included, so a nested app can
 * mount there. Runs before the nested root is marked, while its elements still
 * resolve to `app`. Mirrors `mountSubtree`, which bound them.
 */
export function releaseSubtree(root: Element, app: RouseApp) {
  forEachOwned<HTMLScriptElement>(root, rzStore.selector, app, (el) =>
    rzStore.teardown(el),
  );

  forEachOwned<HTMLElement>(root, SCOPE_SELECTOR, app, (el) => destroyInstance(el));

  for (const directive of NETWORK_DIRECTIVES) {
    forEachOwned(root, directive.selector, app, (el) => directive.teardown(el));
  }

  const ownerScope = root.closest<HTMLElement>(SCOPE_SELECTOR);

  if (ownerScope && !hasDirective(root, 'scope') && getApp(ownerScope, app)) {
    teardownScopeNode(ownerScope, root);
  }

  if (!ownerScope) {
    teardownGlobalBindings(root, (el) => !!getApp(el, app));
  }
}

/**
 * Creates a `MutationObserver` scoped to the provided app instance. Sets up added
 * subtrees and tears down removed ones.
 *
 * @returns A configured, unstarted MutationObserver instance.
 */
export function initObserver(app: RouseApp) {
  return new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        // If a subtree is added then removed before the current task finishes,
        // the add will be reported, but the node will be detached when the observer
        // runs. So skip it to avoid errant ownership warnings.
        if (node.nodeType === Node.ELEMENT_NODE && node.isConnected) {
          mountSubtree(node as Element, app);
        }
      }

      for (const node of mutation.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const removedEl = node as Element;
        unmountSubtree(removedEl);

        // Ownership resolved against the `scopeBindings` WeakMap, not DOM
        // ancestry. Survives detached parents, cross-boundary moves, and
        // sync-detachment edge cases.
        const ownerScope = resolveRemovedOwner(removedEl);
        if (!ownerScope) {
          teardownGlobalBindings(removedEl);
        } else if (!hasDirective(removedEl, 'scope')) {
          teardownScopeNode(ownerScope, removedEl);
        }
      }
    }
  });
}
