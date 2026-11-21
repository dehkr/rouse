/*
 * A bound element is owned by its nearest `rz-scope`, or mounts globally against
 * `EMPTY_SCOPE`. Ownership is found with `closest()` when nodes are added and read from
 * `scopeBindings` when they're removed, since by then a removed node's parent is gone
 * or is already its new one. Keep that asymmetry. A leak here is a cleanup that never
 * ran, so weak-keying `elementCleanups` wouldn't fix one; resolving the owner does.
 *
 * `resolveOwnerState` restates the ownership rule for standalone directives, so a new
 * ownership boundary must be taught to it as well as to `boundElements` and
 * `closestScope`. A nested app's root is one: a scope above it belongs to another app.
 *
 * A bound directive whose key is its subject needs `singleValue: true`. Without it,
 * `a, b` binds twice on one element and the last effect to run wins, with no warning.
 */
import type { RouseApp } from '../app';
import { directiveSelector, getDirectiveValue, SCOPE_SELECTOR } from '../core/elements';
import { APP_ROOT_SELECTOR } from '../core/constants';
import { err, warn } from '../core/diagnostics';
import { dispatchFrom } from '../core/dispatch';
import { parseDirectiveValue } from '../core/parser';
import { EMPTY_SCOPE } from '../core/resolve';
import type { BoundDirective, Scope, VoidFn } from '../types';

/** Registry to track cleanup functions of globally mounted directives. */
const globalBindings = new WeakMap<Element, VoidFn[]>();
/** Registry mapping scope-bound elements to their scope root element. */
const scopeBindings = new WeakMap<Element, HTMLElement>();
/** Registry of `rz-render` instance roots, mapped to the render context they bind against. */
const renderOwned = new WeakMap<Element, Scope>();
/** Bound directives the binder scans for, and a selector matching any of them. */
let boundDirectiveList: readonly BoundDirective[] = [];
let boundSelector = '';
/** Scope elements whose DOM is bound and whose `rz:scope:connect` has fired, mapped to their instance. */
const awakeScopes = new WeakMap<Element, Scope>();
/** App roots mapped to the app attached to each. */
const appInstances = new WeakMap<Element, RouseApp>();

const APP_ROOT_ATTR = 'data-rouse-app';

/** Marks `root` as the app root of `app` so `getApp` resolves its descendants. */
export function attachApp(root: HTMLElement, app: RouseApp): void {
  root.setAttribute(APP_ROOT_ATTR, '');
  appInstances.set(root, app);
}

/** Unmarks `root`, after which `getApp` no longer resolves its descendants. */
export function detachApp(root: HTMLElement): void {
  root.removeAttribute(APP_ROOT_ATTR);
  appInstances.delete(root);
}

/** Returns the app attached to `root` itself, without searching ancestors. */
export function appAt(root: Element): RouseApp | undefined {
  return appInstances.get(root);
}

/**
 * Returns the app owning `el`, found through its nearest app root. With `expected`,
 * returns `undefined` when the owner is a different app, which keeps scan sites out
 * of nested apps.
 */
export function getApp(el: Element, expected?: RouseApp): RouseApp | undefined {
  const root = el.closest(APP_ROOT_SELECTOR);
  if (!root) {
    if (__DEV__) {
      warn('Element is not inside an app instance.', el);
    }
    return undefined;
  }

  const found = appInstances.get(root);

  // A nested app's elements should not be picked up if a parent app scans its
  // subtree. That's the normal case, so it returns without a warning.
  if (expected && found !== expected) {
    return undefined;
  }

  return found;
}

/**
 * Resolves the nearest enclosing scope element for `el` within the given `app`. Scopes
 * outside `app.root` are ignored to prevent nested applications from resolving ancestor
 * scopes belonging to an outer app.
 */
export function closestScope(el: Element, app: RouseApp): HTMLElement | null {
  const scopeEl = el.closest<HTMLElement>(SCOPE_SELECTOR);
  return scopeEl && app.root.contains(scopeEl) ? scopeEl : null;
}

/** Returns true if a scope element is currently connected. */
export function isScopeAwake(el: Element): boolean {
  return awakeScopes.has(el);
}

/**
 * Sets the directives the binder scans for and binds. `app.ts` calls it once, at
 * module load.
 */
export function registerBoundDirectives(directives: readonly BoundDirective[]): void {
  boundDirectiveList = directives;
  boundSelector = directives
    .map((directive) => directiveSelector(directive.slug))
    .join(', ');
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
    if (node === root) {
      break;
    }
  }

  return EMPTY_SCOPE;
}

/**
 * Executes the attachment lifecycle for all bound directives on a specific element.
 */
export function bindDirectives(el: Element, scope: Scope, app: RouseApp): VoidFn[] {
  return boundDirectiveList.flatMap((directive) => {
    const value = getDirectiveValue(el, directive.slug);

    // Strict check to allow empty/boolean directives
    if (value === null) {
      return [];
    }

    const parsed = parseDirectiveValue(value);

    // Use the first value if a directive only accepts one
    if (directive.singleValue && parsed.length > 1) {
      if (__DEV__) {
        warn(
          `rz-${directive.slug}: accepts a single value, but received ${parsed.length}. Ignoring extra values.`,
          el,
        );
      }
      parsed.length = 1;
    }

    return parsed.flatMap(([key, val]) => directive.bind(el, scope, app, key, val ?? ''));
  });
}

/**
 * Yields `root` and each element in its subtree carrying a bound directive, in
 * document order. Lazy, so a caller can stop early. Skips three boundaries so
 * ownership stays correct:
 *
 * - nested `rz-scope` subtrees, owned by their own scope
 * - nested app roots, owned by their own app
 * - `rz-render` instance subtrees, bound by the render engine with item context
 *
 * A `root` that is itself a scope is skipped entirely by default; pass
 * `acceptScopeRoot` to bind `root` itself while still skipping nested scopes.
 */
export function* boundElements(
  root: Element,
  options?: { acceptScopeRoot?: boolean },
): Generator<Element> {
  // If root is itself a scope and the caller hasn't opted in,
  // the entire subtree is scope-owned.
  if (!options?.acceptScopeRoot && root.matches(SCOPE_SELECTOR)) return;

  // Render-owned subtrees are bound by `rz-render` itself, with item context
  if (renderOwned.has(root)) {
    return;
  }

  if (root.matches(boundSelector)) {
    yield root;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as Element;
      if (
        el.matches(SCOPE_SELECTOR) ||
        el.matches(APP_ROOT_SELECTOR) ||
        renderOwned.has(el)
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      return el.matches(boundSelector)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    yield node as Element;
  }
}

/**
 * Attaches bound directives to an element outside of a scope.
 * Resolves reactive state against global stores rather than local variables.
 */
export function mountGlobalBinding(el: Element, app: RouseApp): void {
  if (globalBindings.has(el)) {
    return;
  }
  // Recorded even when empty, so a re-scan doesn't bind again and repeat warnings
  globalBindings.set(el, bindDirectives(el, EMPTY_SCOPE, app));
}

/**
 * Traverses a removed DOM subtree and executes cleanup functions for
 * any globally mounted directives. `owns` limits it to the elements it accepts.
 */
export function teardownGlobalBindings(
  root: Element,
  owns?: (el: Element) => boolean,
): void {
  for (const el of boundElements(root)) {
    if (owns && !owns(el)) {
      continue;
    }

    const cleanups = globalBindings.get(el);
    if (!cleanups) {
      continue;
    }

    globalBindings.delete(el);
    runCleanups(el, cleanups);
  }
}

/**
 * Resolves the scope root that owns a removed subtree. Returns null for globally
 * bound or unbound subtrees.
 *
 * Tries the element itself first, since the walk skips a scope root. Then stops at
 * the first bound descendant either registry knows: all share the same owner.
 */
export function resolveRemovedOwner(el: Element): HTMLElement | null {
  const direct = scopeBindings.get(el);
  if (direct) {
    return direct;
  }

  for (const boundEl of boundElements(el)) {
    const owner = scopeBindings.get(boundEl);
    if (owner) {
      return owner;
    }
    if (globalBindings.has(boundEl)) {
      return null;
    }
  }

  return null;
}

/**
 * Runs each cleanup, isolating failures so one throwing cleanup doesn't
 * abort the rest.
 */
export function runCleanups(el: Element, cleanups: VoidFn[]): void {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      err('Directive cleanup failed.', el, error);
    }
  }
}

/**
 * Invokes a scope lifecycle hook, isolating a throw so the surrounding mount or
 * teardown still completes.
 */
function runHook(instance: Scope, name: 'connect' | 'disconnect', root: Element): void {
  const hook = instance[name];
  if (typeof hook !== 'function') {
    return;
  }

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
  const elementCleanups = new Map<Element, VoidFn[]>();

  function runCleanup(el: Element) {
    const cleanups = elementCleanups.get(el);
    if (!cleanups) {
      return;
    }

    elementCleanups.delete(el);
    scopeBindings.delete(el);
    runCleanups(el, cleanups);
  }

  function bindNode(el: Element) {
    if (elementCleanups.has(el)) {
      return;
    }
    // Recorded even when empty, as a global mount is, so a re-scan doesn't bind again
    // and the removal path resolves the owner from any bound element
    elementCleanups.set(el, bindDirectives(el, instance, app));
    scopeBindings.set(el, root);
  }

  function scan(startEl: Element) {
    const owner = startEl.closest(SCOPE_SELECTOR);
    if (!owner || owner !== root) {
      return;
    }
    // Markup added inside a nested app's root belongs to that app
    if (startEl.closest(APP_ROOT_SELECTOR) !== app.root) {
      return;
    }

    for (const el of boundElements(startEl, { acceptScopeRoot: startEl === root })) {
      bindNode(el);
    }
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
  dispatchFrom(root, app.root, 'rz:scope:connect', { instance, host: root });

  // Disconnects the entire scope
  function unbindDom() {
    for (const el of elementCleanups.keys()) {
      runCleanup(el);
    }
    runHook(instance, 'disconnect', root);
    awakeScopes.delete(root);
    dispatchFrom(root, app.root, 'rz:scope:disconnect', { instance, host: root });
  }

  return { unbindDom, scan, teardown };
}
