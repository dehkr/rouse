/*
 * A bound element is owned by its nearest `rz-scope`, or mounts globally against
 * `EMPTY_SCOPE`. Ownership is found with `closest()` when nodes are added and read from
 * `scopeBindings` when they're removed, since by then a removed node's parent is gone
 * or is already its new one. Keep that asymmetry. A leak here is a cleanup that never
 * ran, so weak-keying `elementCleanups` wouldn't fix one; resolving the owner does.
 *
 * `resolveOwnerState` restates the ownership rule for standalone directives, so a new
 * ownership boundary must be taught to it as well as to `walkBoundElements`.
 *
 * A bound directive whose key is its subject needs `singleValue: true`. Without it,
 * `a, b` binds twice on one element and the last effect to run wins, with no warning.
 */
import type { RouseApp } from '../core/app';
import { getDirectiveValue } from '../core/attributes';
import { err, warn } from '../core/diagnostics';
import { dispatch } from '../core/dispatch';
import { parseDirectiveValue } from '../core/parser';
import { EMPTY_SCOPE } from '../core/resolve';
import { SCOPE_SELECTOR } from '../directives/rz-scope';
import type { BoundCleanupFn, BoundDirective, Scope } from '../types';

/** Registry to track cleanup functions of globally mounted directives. */
const globalBindings = new WeakMap<Element, BoundCleanupFn[]>();
/** Registry mapping scope-bound elements to their scope root element. */
const scopeBindings = new WeakMap<Element, HTMLElement>();
/** Registry of `rz-render` instance roots, mapped to the render context they bind against. */
const renderOwned = new WeakMap<Element, Scope>();
/** Bound directives the binder scans for, and a selector matching any of them. */
let boundDirectiveList: BoundDirective[] = [];
let boundSelector = '';
/** Scope elements whose DOM is bound and whose `rz:scope:connect` has fired, mapped to their instance. */
const awakeScopes = new WeakMap<Element, Scope>();

/** Returns true if a scope element is currently connected. */
export function isScopeAwake(el: Element): boolean {
  return awakeScopes.has(el);
}

/**
 * Sets the directives the binder scans for and binds. `app.ts` calls it once, at
 * module load.
 */
export function registerBoundDirectives(...directives: BoundDirective[]): void {
  boundDirectiveList = directives;
  boundSelector = directives.map((directive) => directive.selector).join(', ');
}

/**
 * Marks an element as the root of an `rz-render` instance subtree.
 */
export function markRenderOwned(el: Element, ctx: Scope): void {
  renderOwned.set(el, ctx);
}

/**
 * Releases an element when its `rz-render` instance is torn down.
 */
export function unmarkRenderOwned(el: Element): void {
  renderOwned.delete(el);
}

/**
 * Returns the state an element's paths resolve against: the nearest render instance's
 * context or awake scope, searching no higher than `root`. Returns `EMPTY_SCOPE` when
 * there is neither, or when the nearest scope hasn't woken.
 */
export function resolveOwnerState(el: Element, root: Element): Scope {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const ctx = renderOwned.get(node);
    if (ctx) {
      return ctx;
    }
    if (node.matches(SCOPE_SELECTOR)) {
      return awakeScopes.get(node) ?? EMPTY_SCOPE;
    }
    if (node === root) break;
  }

  return EMPTY_SCOPE;
}

/**
 * Executes the attachment lifecycle for all bound directives on a specific element.
 */
export function bindDirectives(
  el: Element,
  scope: Scope,
  app: RouseApp,
): BoundCleanupFn[] {
  const cleanups: BoundCleanupFn[] = [];

  for (const directive of boundDirectiveList) {
    const value = getDirectiveValue(el, directive.slug);

    // Strict check to allow empty/boolean directives
    if (value === null) continue;

    const parsed = parseDirectiveValue(value);

    // Use the first value if a directive only accepts one
    if (directive.singleValue && parsed.length > 1) {
      __DEV__ &&
        warn(
          `rz-${directive.slug}: accepts a single value, but received ${parsed.length}. Ignoring extra values.`,
          el,
        );
      parsed.length = 1;
    }

    for (const [key, val] of parsed) {
      const cleanup = directive.bind(el, scope, app, key, val ?? '');
      if (cleanup) {
        cleanups.push(cleanup);
      }
    }
  }

  return cleanups;
}

/**
 * Walks `root` and its subtree, invoking `callback` for each element carrying a
 * bound directive. Skips two boundaries so ownership stays correct: nested
 * `rz-scope` subtrees (owned by their own scope) and `rz-render` instance
 * subtrees (bound by the render engine with item context).
 *
 * A `root` that is itself a scope is skipped entirely by default; pass
 * `acceptScopeRoot` to bind `root` itself while still skipping nested scopes.
 */
export function walkBoundElements(
  root: Element,
  callback: (el: Element) => void,
  options?: { acceptScopeRoot?: boolean },
): void {
  // If root is itself a scope and the caller hasn't opted in,
  // the entire subtree is scope-owned.
  if (!options?.acceptScopeRoot && root.matches(SCOPE_SELECTOR)) return;

  // Render-owned subtrees are bound by `rz-render` itself, with item context
  if (renderOwned.has(root)) return;

  if (root.matches(boundSelector)) {
    callback(root);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as Element;
      if (el.matches(SCOPE_SELECTOR) || renderOwned.has(el)) {
        return NodeFilter.FILTER_REJECT;
      }

      return el.matches(boundSelector)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });

  let node = walker.nextNode();

  while (node !== null) {
    callback(node as Element);
    node = walker.nextNode();
  }
}

/**
 * Attaches bound directives to an element outside of a scope.
 * Resolves reactive state against global stores rather than local variables.
 */
export function mountGlobalBinding(el: Element, app: RouseApp): void {
  if (globalBindings.has(el)) return;
  const cleanups = bindDirectives(el, EMPTY_SCOPE, app);
  if (cleanups.length) {
    globalBindings.set(el, cleanups);
  }
}

/**
 * Traverses a removed DOM subtree and executes cleanup functions for
 * any globally mounted directives. `owns` limits it to the elements it accepts.
 */
export function teardownGlobalBindings(
  root: Element,
  owns?: (el: Element) => boolean,
): void {
  walkBoundElements(root, (el) => {
    if (owns && !owns(el)) return;

    const cleanups = globalBindings.get(el);
    if (!cleanups) return;

    globalBindings.delete(el);
    runCleanups(el, cleanups);
  });
}

/**
 * Resolves the scope root that owns a removed subtree.
 * Tries the element itself first then falls back to scanning the subtree
 * for any bound descendant (all share the same owner). Returns null for
 * globally-bound or unbound subtrees.
 */
export function resolveRemovedOwner(el: Element): HTMLElement | null {
  const direct = scopeBindings.get(el);
  if (direct) return direct;

  let found: HTMLElement | null = null;
  walkBoundElements(el, (boundEl) => {
    if (!found) {
      const owner = scopeBindings.get(boundEl);
      if (owner) {
        found = owner;
      }
    }
  });

  return found;
}

/**
 * Runs each cleanup, isolating failures so one throwing cleanup doesn't
 * abort the rest.
 */
export function runCleanups(el: Element, cleanups: BoundCleanupFn[]): void {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      __DEV__ && err('Cleanup failed for element:', el, error);
    }
  }
}

/**
 * Invokes a scope lifecycle hook, isolating a throw so the surrounding mount or
 * teardown still completes.
 */
function runHook(instance: Scope, name: 'connect' | 'disconnect', root: Element): void {
  const hook = instance[name];
  if (typeof hook !== 'function') return;

  try {
    hook.call(instance);
  } catch (error) {
    err(`Scope hook '${name}()' failed.`, root, error);
  }
}

/**
 * Binds a scope instance to its DOM subtree: scans and binds directives, runs
 * the `connect` hook, and dispatches `rz:scope:connect`. Returns the scope's DOM
 * lifecycle handle:
 *
 * - `scan(el)`: bind directives on a newly added node within the scope.
 * - `teardown(el)`: run cleanups for a removed node and its subtree.
 * - `unbindDom()`: tear down the whole scope (all cleanups, `disconnect`, `rz:scope:disconnect`).
 */
export function bindScope(root: HTMLElement, instance: Scope, app: RouseApp) {
  const elementCleanups = new Map<Element, BoundCleanupFn[]>();
  const boundNodes = new WeakSet<Element>();

  function runCleanup(el: Element) {
    boundNodes.delete(el);

    const cleanups = elementCleanups.get(el);
    if (!cleanups) return;

    elementCleanups.delete(el);
    scopeBindings.delete(el);
    runCleanups(el, cleanups);
  }

  function bindNode(el: Element) {
    if (boundNodes.has(el)) return;
    boundNodes.add(el);

    const cleanups = bindDirectives(el, instance, app);
    if (!cleanups.length) return;

    elementCleanups.set(el, cleanups);
    scopeBindings.set(el, root);
  }

  function scan(startEl: Element) {
    const owner = startEl.closest(SCOPE_SELECTOR);
    if (!owner || owner !== root) return;

    walkBoundElements(startEl, bindNode, {
      acceptScopeRoot: startEl === root,
    });
  }

  function teardown(removedEl: Element) {
    if (elementCleanups.has(removedEl)) {
      runCleanup(removedEl);
    }

    const walker = document.createTreeWalker(removedEl, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();

    while (node !== null) {
      const el = node as Element;
      if (elementCleanups.has(el)) {
        runCleanup(el);
      }
      node = walker.nextNode();
    }
  }

  // Initial scan
  scan(root);

  runHook(instance, 'connect', root);

  // Marked before the dispatch: a `connect` handler that swaps in new DOM triggers a
  // scan, and any `wake` directive inside it must resolve an already-awake scope.
  awakeScopes.set(root, instance);

  // The DOM is bound and the scope is fully active
  dispatch(root, 'rz:scope:connect', { instance });

  // Disconnects the entire scope
  function unbindDom() {
    for (const el of elementCleanups.keys()) {
      runCleanup(el);
    }
    runHook(instance, 'disconnect', root);
    awakeScopes.delete(root);
    dispatch(root, 'rz:scope:disconnect', { instance });
  }

  return { unbindDom, scan, teardown };
}
