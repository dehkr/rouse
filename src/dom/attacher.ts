import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { directiveSelector, err, hasDirective } from '../core/shared';
import { rzBind, rzHtml, rzModel, rzOn, rzText } from '../directives';
import type { BoundCleanupFn, Controller } from '../types';
import { dispatch } from './scheduler';

const BOUND_DIRECTIVES = [rzBind, rzHtml, rzModel, rzOn, rzText] as const;

// Selector string of all DOM directives ([rz-bind], [data-rz-bind]...)
const DIRECTIVES_SELECTOR = BOUND_DIRECTIVES.map((directive) =>
  directiveSelector(directive.slug),
).join(', ');

/**
 * Binds the controller instance to the DOM.
 * Returns internal lifecycle methods so the app can delegate DOM mutations.
 */
export function attachController(
  root: HTMLElement,
  instance: Controller,
  app: RouseApp,
  skipLifecycles = false,
) {
  const elementCleanups = new Map<Element, (() => void)[]>();
  const boundNodes = new WeakSet<Element>();

  function addCleanup(el: Element, fn: BoundCleanupFn) {
    const cleanups = elementCleanups.get(el) ?? [];
    if (!elementCleanups.has(el)) {
      elementCleanups.set(el, cleanups);
    }
    cleanups.push(fn);
  }

  function runCleanup(el: Element) {
    boundNodes.delete(el);

    const functions = elementCleanups.get(el);
    if (!functions) return;

    elementCleanups.delete(el);

    for (const fn of functions) {
      try {
        fn();
      } catch (error) {
        err('Cleanup failed for element:', el, error);
      }
    }
  }

  /**
   * Process each of the dom directives and register their cleanup functions
   */
  function attachDirectives(el: Element) {
    if (boundNodes.has(el)) return;
    boundNodes.add(el);

    for (const directive of BOUND_DIRECTIVES) {
      const value = directive.getValue(el);

      // Strict check to allow empty/boolean directives
      if (value === null) continue;

      const parsed = parseDirectiveValue(value);
      for (const [key, val] of parsed) {
        const cleanup = directive.attach(el, instance, app, key, val);
        if (cleanup) addCleanup(el, cleanup);
      }
    }
  }

  /**
   * Scans a newly inserted node for directives
   */
  function scan(startEl: Element) {
    const owner = startEl.closest(directiveSelector('scope'));
    if (!owner || owner !== root) return;

    const walker = document.createTreeWalker(startEl, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as Element;
        // Skip subtrees of nested controllers
        if (el !== root && hasDirective(el, 'scope')) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip nodes that don't match but continue walking
        return el.matches(DIRECTIVES_SELECTOR)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });

    // Check startEl manually
    if (startEl.matches(DIRECTIVES_SELECTOR)) {
      attachDirectives(startEl as HTMLElement);
    }

    // Apply accepted nodes
    let node: Node | null;
    while ((node = walker.nextNode())) {
      attachDirectives(node as HTMLElement);
    }
  }

  function teardown(removedEl: Element) {
    if (elementCleanups.has(removedEl)) {
      runCleanup(removedEl);
    }

    const walker = document.createTreeWalker(removedEl, NodeFilter.SHOW_ELEMENT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node as Element;
      if (elementCleanups.has(el)) {
        runCleanup(el);
      }
    }
  }

  // Initial scan
  scan(root);

  if (typeof instance.connect === 'function' && !skipLifecycles) {
    instance.connect();
  }

  // The DOM is bound and the controller is fully active
  dispatch(root, 'rz:controller:connect', { instance });

  // Disconnects the entire controller
  function unbindDom() {
    for (const el of elementCleanups.keys()) {
      runCleanup(el);
    }
    if (typeof instance.disconnect === 'function' && !skipLifecycles) {
      instance.disconnect();
    }
    dispatch(root, 'rz:controller:disconnect', { instance });
  }

  return { unbindDom, scan, teardown };
}
