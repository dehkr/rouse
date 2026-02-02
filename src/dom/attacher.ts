import { applyBind, applyHtml, applyModel, applyOn, applyText } from '../directives';
import type { RouseController } from '../types';
import { isElement } from './utils';
import { getDirective, hasDirective, selector } from './attributes';
import { parseDirective } from './parser';

type Cleanup = (() => void) | void;

interface SimpleDirective {
  slug: string;
  multi: false;
  apply: (el: HTMLElement, inst: RouseController, value: string) => Cleanup;
}

interface MultiDirective {
  slug: string;
  multi: true;
  apply: (el: HTMLElement, inst: RouseController, p1: string, p2: string) => Cleanup;
}

type DirectiveDef = SimpleDirective | MultiDirective;

/**
 * Directive registry
 */
const DIRECTIVES: Record<string, DirectiveDef> = {
  rzBind: {
    slug: 'bind',
    multi: true,
    apply: (el, inst, type, path) => applyBind(el, inst, type, path),
  },
  rzOn: {
    slug: 'on',
    multi: true,
    apply: (el, inst, evt, method) => {
      if (typeof inst[method] === 'function') {
        return applyOn(el, inst, evt, method);
      }
      console.warn(`[Rouse] Method "${method}" not found on controller.`);
    },
  },
  rzText: {
    slug: 'text',
    multi: false,
    apply: (el, inst, val) => applyText(el, inst, val),
  },
  rzHtml: {
    slug: 'html',
    multi: false,
    apply: (el, inst, val) => applyHtml(el, inst, val),
  },
  rzModel: {
    slug: 'model',
    multi: false,
    apply: (el, inst, val) => applyModel(el, inst, val),
  },
} as const;

/**
 * Binds the controller instance to the DOM.
 * Handles initial bindings and observes nodes within its scope.
 */
export function attachController(root: HTMLElement, instance: RouseController) {
  const elementCleanups = new Map<HTMLElement, (() => void)[]>();
  const boundNodes = new WeakSet<HTMLElement>();

  // const DIRECTIVE_ENTRIES = Object.entries(DIRECTIVES);
  const DIRECTIVES_VALUES = Object.values(DIRECTIVES);
  const DIRECTIVES_SELECTOR = DIRECTIVES_VALUES
    .map((d) => selector(d.slug))
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

    for (const def of DIRECTIVES_VALUES) {
      const rawValue = getDirective(el, def.slug);

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
    // Don't scan nested controllers
    if (hasDirective(startEl, 'use') && startEl !== root) return;

    // Bind el if it belongs to controller scope and has directives
    const belongsToMe = startEl === root || startEl.closest(selector('use')) === root;
    if (belongsToMe && startEl.matches(DIRECTIVES_SELECTOR)) {
      apply(startEl);
    }

    // TODO: replace querySelector with TreeWalker
    if (startEl.children.length > 0) {
      const children = startEl.querySelectorAll<HTMLElement>(DIRECTIVES_SELECTOR);
      for (const child of children) {
        // Only bind if the closest data-rz ancestor is this controller
        if (child.closest(selector('use')) === root) {
          apply(child);
        }
      }
    }
  }

  function teardown(el: HTMLElement) {
    runCleanup(el);
    // Clean up descendants
    const children = el.querySelectorAll<HTMLElement>(DIRECTIVES_SELECTOR);
    for (const child of children) {
      runCleanup(child);
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
    // Run cleanup on all tracked elements of this instance
    for (const el of elementCleanups.keys()) {
      runCleanup(el);
    }
    if (typeof instance.disconnect === 'function') {
      instance.disconnect();
    }
  };
}
