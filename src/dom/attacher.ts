import { parseDirectiveValue } from '../core/parser';
import { directiveSelector, err, getDirectiveValue, hasDirective } from '../core/shared';
import { rzBind, rzHtml, rzModel, rzOn, rzText } from '../directives';
import type { CleanupFunction, RouseController } from '../types';
import { dispatch, isElement } from './utils';

/**
 * Binds the controller instance to the DOM.
 * Handles initial bindings and observes nodes within its scope.
 */
export function attachController(root: HTMLElement, instance: RouseController) {
  const elementCleanups = new Map<HTMLElement, (() => void)[]>();
  const boundNodes = new WeakSet<HTMLElement>();

  const domDirectives = [rzBind, rzHtml, rzModel, rzOn, rzText];

  // Selector string of all DOM directives ([rz-bind], [data-rz-bind]...)
  const directivesSelector = domDirectives
    .map((directive) => directiveSelector(directive.slug))
    .join(', ');

  function addCleanup(el: HTMLElement, fn: CleanupFunction) {
    const cleanups = elementCleanups.get(el) ?? [];
    if (!elementCleanups.has(el)) {
      elementCleanups.set(el, cleanups);
    }
    cleanups.push(fn);
  }

  function runCleanup(el: HTMLElement) {
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
  function attachDirectives(el: HTMLElement) {
    if (boundNodes.has(el)) return;
    boundNodes.add(el);

    for (const directive of domDirectives) {
      const { slug, handler } = directive;
      const rawValue = getDirectiveValue(el, slug);

      // Strict check to allow empty/boolean directives
      if (rawValue === null) continue;

      const registerCleanup = (cleanup: CleanupFunction) => {
        if (cleanup) {
          addCleanup(el, cleanup);
        }
      };

      const parsed = parseDirectiveValue(rawValue);
      for (const [key, value] of parsed) {
        registerCleanup(handler(el, instance, key, value));
      }
    }
  }

  function scan(startEl: HTMLElement) {
    const owner = startEl.closest(directiveSelector('scope'));
    if (!owner || owner !== root) return;

    const walker = document.createTreeWalker(startEl, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as HTMLElement;
        // Skip subtrees of nested controllers
        if (el !== root && hasDirective(el, 'scope')) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip nodes that don't match but continue walking
        return el.matches(directivesSelector)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });

    // Check startEl manually
    if (startEl.matches(directivesSelector)) {
      attachDirectives(startEl);
    }

    // Apply accepted nodes
    while (walker.nextNode()) {
      attachDirectives(walker.currentNode as HTMLElement);
    }
  }

  function teardown(removedEl: HTMLElement) {
    for (const boundEl of [...elementCleanups.keys()]) {
      if (removedEl === boundEl || removedEl.contains(boundEl)) {
        runCleanup(boundEl);
      }
    }
  }

  // Initial scan
  scan(root);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (isElement(node)) {
          scan(node);
        }
      }
      for (const node of m.removedNodes) {
        if (isElement(node)) {
          teardown(node);
        }
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });

  // Call lifecycle `connect` method if defined in controller
  if (typeof instance.connect === 'function') {
    instance.connect();
  }

  // The DOM is bound and the controller is fully active
  dispatch(root, 'rz:controller:connect', { instance });

  // Return global disconnect function
  return () => {
    observer.disconnect();
    // Cleanup all tracked elements of this instance
    for (const el of [...elementCleanups.keys()]) {
      runCleanup(el);
    }
    // If controller defined a disconnect function, run it
    if (typeof instance.disconnect === 'function') {
      instance.disconnect();
    }

    dispatch(root, 'rz:controller:disconnect', { instance });
  };
}
