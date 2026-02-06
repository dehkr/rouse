import type { DirectiveDef, DomDirectiveSlug } from '../directives';
import { DOM_DIRECTIVES } from '../directives';
import { getDirective, hasDirective, selector } from '../directives/prefix';
import type { RouseController } from '../types';
import { parseDirective } from './parser';
import { isElement } from './utils';

/**
 * Binds the controller instance to the DOM.
 * Handles initial bindings and observes nodes within its scope.
 */
export function attachController(root: HTMLElement, instance: RouseController) {
  const elementCleanups = new Map<HTMLElement, (() => void)[]>();
  const boundNodes = new WeakSet<HTMLElement>();

  const DIRECTIVES_ENTRIES = Object.entries(DOM_DIRECTIVES) as [
    DomDirectiveSlug,
    DirectiveDef,
  ][];
  // prettier-ignore
  const DIRECTIVES_SELECTOR = DIRECTIVES_ENTRIES
    .map(([key, _val]) => selector(key))
    .join(', ');

  function addCleanup(el: HTMLElement, fn: () => void) {
    const cleanups = elementCleanups.get(el) ?? [];
    if (!elementCleanups.has(el)) {
      elementCleanups.set(el, cleanups);
    }
    cleanups.push(fn);
  }

  function runCleanup(el: HTMLElement) {
    boundNodes.delete(el);

    const fns = elementCleanups.get(el);
    if (!fns) return;

    elementCleanups.delete(el);

    for (const fn of fns) {
      try {
        fn();
      } catch (err) {
        console.error('[Rouse] Cleanup failed for element:', el, err);
      }
    }
  }

  function apply(el: HTMLElement) {
    if (boundNodes.has(el)) return;
    boundNodes.add(el);

    for (const [key, def] of DIRECTIVES_ENTRIES) {
      const rawValue = getDirective(el, key);

      // Strict check to allow empty/boolean directives
      if (rawValue === null) continue;

      if (def.multi) {
        // Multi-value directive
        const pairs = parseDirective(rawValue);
        pairs.forEach(([key, val]) => {
          const cleanup = def.apply(el, instance, key, val);
          if (cleanup) {
            addCleanup(el, cleanup);
          }
        });
      } else {
        // Simple directives take the whole trimmed value
        const cleanup = def.apply(el, instance, rawValue.trim());
        if (cleanup) {
          addCleanup(el, cleanup);
        }
      }
    }
  }

  function scan(startEl: HTMLElement) {
    const owner = startEl.closest(selector('use'));
    if (!owner || owner !== root) return;

    const walker = document.createTreeWalker(startEl, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as HTMLElement;
        // Skip subtrees of nested controllers
        if (el !== root && hasDirective(el, 'use')) {
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
      apply(startEl);
    }

    // Apply accepted nodes
    while (walker.nextNode()) {
      apply(walker.currentNode as HTMLElement);
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
  };
}
