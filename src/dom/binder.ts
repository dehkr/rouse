import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { directiveSelector, EMPTY_SCOPE, err, getDirectiveValue } from '../core/shared';
import {
  rzAttr,
  rzClass,
  rzHtml,
  rzModel,
  rzOn,
  rzProp,
  rzStyle,
  rzText,
} from '../directives';
import type { BoundCleanupFn, Scope } from '../types';
import { dispatch } from './scheduler';

/** Registry to track cleanup functions of globally mounted directives. */
const globalBindings = new WeakMap<Element, BoundCleanupFn[]>();

/** Registry mapping scope-bound elements to their scope root element. */
const scopeBindings = new WeakMap<Element, HTMLElement>();

/** Directives that can be bound to local scope. */
const BOUND_DIRECTIVES = [
  rzAttr,
  rzClass,
  rzHtml,
  rzModel,
  rzOn,
  rzProp,
  rzStyle,
  rzText,
] as const;

/** Selector string of all scope-bound directives. */
export const DIRECTIVES_SELECTOR = BOUND_DIRECTIVES.map((directive) =>
  directiveSelector(directive.slug),
).join(', ');

/**
 * Executes the attachment lifecycle for all bound directives on a specific element.
 */
export function bindDirectives(
  el: Element,
  scope: Scope,
  app: RouseApp,
): BoundCleanupFn[] {
  const cleanups: BoundCleanupFn[] = [];

  for (const directive of BOUND_DIRECTIVES) {
    const value = getDirectiveValue(el, directive.slug);

    // Strict check to allow empty/boolean directives
    if (value === null) continue;

    const parsed = parseDirectiveValue(value);
    for (const [key, val] of parsed) {
      const cleanup = directive.bind(el, scope, app, key, val);
      if (cleanup) cleanups.push(cleanup);
    }
  }

  return cleanups;
}

const scopeSelector = directiveSelector('scope');

/**
 * Scans the DOM and locates elements with bound directives.
 */
export function walkBoundElements(
  root: Element,
  callback: (el: Element) => void,
  options?: { acceptScopeRoot?: boolean },
): void {
  // If root is itself a scope and the caller hasn't opted in,
  // the entire subtree is scope-owned.
  if (!options?.acceptScopeRoot && root.matches(scopeSelector)) return;

  if (root.matches(DIRECTIVES_SELECTOR)) {
    callback(root);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as Element;
      if (el.matches(scopeSelector)) {
        return NodeFilter.FILTER_REJECT;
      }

      return el.matches(DIRECTIVES_SELECTOR)
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
 * any globally mounted directives.
 */
export function teardownGlobalBindings(root: Element): void {
  walkBoundElements(root, (el) => {
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
      if (owner) found = owner;
    }
  });

  return found;
}

function runCleanups(el: Element, fns: BoundCleanupFn[]): void {
  for (const fn of fns) {
    try {
      fn();
    } catch (e) {
      err('Cleanup failed for element:', el, e);
    }
  }
}

/**
 * Binds the scope instance to the DOM.
 * Returns internal lifecycle methods so the app can delegate DOM mutations.
 */
export function bindScope(
  root: HTMLElement,
  instance: Scope,
  app: RouseApp,
  skipLifecycles = false,
) {
  const elementCleanups = new Map<Element, BoundCleanupFn[]>();
  const boundNodes = new WeakSet<Element>();

  function addCleanup(el: Element, fn: BoundCleanupFn) {
    const cleanups = elementCleanups.get(el) ?? [];
    if (!elementCleanups.has(el)) {
      elementCleanups.set(el, cleanups);
      scopeBindings.set(el, root);
    }
    cleanups.push(fn);
  }

  function runCleanup(el: Element) {
    boundNodes.delete(el);

    const cleanups = elementCleanups.get(el);
    if (!cleanups) return;

    elementCleanups.delete(el);
    scopeBindings.delete(el);
    runCleanups(el, cleanups);
  }

  /** Process DOM directives and register their cleanup functions. */
  function bindNode(el: Element) {
    if (boundNodes.has(el)) return;
    boundNodes.add(el);

    const cleanups = bindDirectives(el, instance, app);
    for (const fn of cleanups) {
      addCleanup(el, fn);
    }
  }

  /** Scans a newly added node for directives. */
  function scan(startEl: Element) {
    const owner = startEl.closest(scopeSelector);
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
      if (elementCleanups.has(el)) runCleanup(el);
      node = walker.nextNode();
    }
  }

  // Initial scan
  scan(root);

  if (typeof instance.connect === 'function' && !skipLifecycles) {
    instance.connect();
  }

  // The DOM is bound and the scope is fully active
  dispatch(root, 'rz:scope:connect', { instance });

  // Disconnects the entire scope
  function unbindDom() {
    for (const el of elementCleanups.keys()) {
      runCleanup(el);
    }
    if (typeof instance.disconnect === 'function' && !skipLifecycles) {
      instance.disconnect();
    }
    dispatch(root, 'rz:scope:disconnect', { instance });
  }

  return { unbindDom, scan, teardown };
}
