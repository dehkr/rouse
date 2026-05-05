import type { RouseApp } from '../core/app';
import { parseDirectiveValue } from '../core/parser';
import { directiveSelector, err, hasDirective } from '../core/shared';
import { rzBind, rzHtml, rzModel, rzOn, rzText } from '../directives';
import type { BoundCleanupFn, BoundDirective, Controller, DirectiveSlug } from '../types';
import { dispatch } from './scheduler';

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

  const boundDirectives = {
    bind: rzBind,
    html: rzHtml,
    model: rzModel,
    on: rzOn,
    text: rzText,
  } as const satisfies Partial<Record<DirectiveSlug, BoundDirective>>;

  const slugs = Object.keys(boundDirectives);
  const directives = Object.values(boundDirectives);

  // Selector string of all DOM directives ([rz-bind], [data-rz-bind]...)
  const directivesSelector = slugs
    .map((slug) => directiveSelector(slug as DirectiveSlug))
    .join(', ');

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

    for (const directive of directives) {
      const value = directive.getValue(el);

      // Strict check to allow empty/boolean directives
      if (value === null) continue;

      const registerCleanup = (cleanup: BoundCleanupFn | void) => {
        if (cleanup) {
          addCleanup(el, cleanup);
        }
      };

      const parsed = parseDirectiveValue(value);
      for (const [key, val] of parsed) {
        registerCleanup(directive.attach(el, instance, app, key, val));
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
        return el.matches(directivesSelector)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });

    // Check startEl manually
    if (startEl.matches(directivesSelector)) {
      attachDirectives(startEl as HTMLElement);
    }

    // Apply accepted nodes
    while (walker.nextNode()) {
      attachDirectives(walker.currentNode as HTMLElement);
    }
  }

  function teardown(removedEl: Element) {
    for (const boundEl of [...elementCleanups.keys()]) {
      if (removedEl === boundEl || removedEl.contains(boundEl)) {
        runCleanup(boundEl);
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
    for (const el of [...elementCleanups.keys()]) {
      runCleanup(el);
    }
    if (typeof instance.disconnect === 'function' && !skipLifecycles) {
      instance.disconnect();
    }
    dispatch(root, 'rz:controller:disconnect', { instance });
  }

  return { unbindDom, scan, teardown };
}
