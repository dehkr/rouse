import { applyBind, applyHtml, applyModel, applyOn, applyText } from '../directives';
import type { RouseController } from '../types';
import { isElement } from './utils';

// TYPES

type Cleanup = (() => void) | void;

interface SimpleDirective {
  multi: false;
  selector: string;
  apply: (el: HTMLElement, inst: RouseController, value: string) => Cleanup;
}

interface MultiDirective {
  multi: true;
  selector: string;
  apply: (el: HTMLElement, inst: RouseController, p1: string, p2: string) => Cleanup;
}

type DirectiveDef = SimpleDirective | MultiDirective;

// DIRECTIVE REGISTRY

const DIRECTIVES: Record<string, DirectiveDef> = {
  rzBind: {
    selector: '[data-rz-bind]',
    multi: true,
    apply: (el, inst, type, path) => applyBind(el, inst, type, path),
  },
  rzOn: {
    selector: '[data-rz-on]',
    multi: true,
    apply: (el, inst, evt, method) => {
      if (typeof inst[method] === 'function') {
        return applyOn(el, inst, evt, method);
      }
      console.warn(`[Rouse] Method "${method}" not found on controller.`);
    },
  },
  rzText: {
    selector: '[data-rz-text]',
    multi: false,
    apply: (el, inst, val) => applyText(el, inst, val),
  },
  rzHtml: {
    selector: '[data-rz-html]',
    multi: false,
    apply: (el, inst, val) => applyHtml(el, inst, val),
  },
  rzModel: {
    selector: '[data-rz-model]',
    multi: false,
    apply: (el, inst, val) => applyModel(el, inst, val),
  },
} as const;

// CONSTANTS

const REGEX_SPLIT = /\s+/;
const REGEX_PARSE = /([a-z]+)->(.+)/;
const DIRECTIVE_ENTRIES = Object.entries(DIRECTIVES);
const DIRECTIVES_QUERY = Object.values(DIRECTIVES)
  .map((d) => d.selector)
  .join(', ');

/**
 * Binds the controller instance to the DOM.
 * Handles initial bindings and observes nodes within its scope.
 */
export function attachController(root: HTMLElement, instance: RouseController) {
  const elementCleanups = new Map<HTMLElement, (() => void)[]>();
  const boundNodes = new WeakSet<HTMLElement>();

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

    for (const [key, def] of DIRECTIVE_ENTRIES) {
      const rawValue = el.dataset[key];
      if (!rawValue) continue;

      if (def.multi) {
        // MultiDirective
        rawValue.split(REGEX_SPLIT).forEach((item) => {
          const match = item.match(REGEX_PARSE);
          if (!match) return;
          const [, left = '', right = ''] = match;
          const cleanup = def.apply(el, instance, left.trim(), right.trim());
          if (cleanup) {
            addCleanup(el, cleanup);
          }
        });
      } else {
        // SimpleDirective
        const cleanup = def.apply(el, instance, rawValue.trim());
        if (cleanup) {
          addCleanup(el, cleanup);
        }
      }
    }
  }

  function scan(el: HTMLElement) {
    // Don't scan nested controllers
    if (el.dataset.rz !== undefined && el !== root) return;

    // Bind el if it belongs to controller scope and has directives
    const belongsToMe = el === root || el.closest('[data-rz]') === root;
    if (belongsToMe && el.matches(DIRECTIVES_QUERY)) {
      apply(el);
    }

    // TODO: replace querySelector with TreeWalker
    if (el.children.length > 0) {
      const children = el.querySelectorAll<HTMLElement>(DIRECTIVES_QUERY);
      for (const child of children) {
        // Only bind if the closest data-rz ancestor is this controller
        if (child.closest('[data-rz]') === root) {
          apply(child);
        }
      }
    }
  }

  function teardown(el: HTMLElement) {
    runCleanup(el);
    // Clean up descendants
    const children = el.querySelectorAll<HTMLElement>(DIRECTIVES_QUERY);
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
