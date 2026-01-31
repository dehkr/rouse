import { applyBind, applyHtml, applyModel, applyOn, applyText } from '../directives';
import type { RouseController } from '../types';
import { isElement } from './utils';

const REGEX_SPLIT = /\s+/;
const REGEX_PARSE = /([a-z]+)->(.+)/;
const DIRECTIVES_QUERY =
  '[data-rz-bind], [data-rz-on], [data-rz-text], [data-rz-html], [data-rz-model]';

const elementCleanups = new Map<HTMLElement, (() => void)[]>();
const boundNodes = new WeakSet<HTMLElement>();

function addCleanup(el: HTMLElement, fn: () => void) {
  const cleanups = elementCleanups.get(el) ?? [];
  if (!elementCleanups.has(el)) {
    elementCleanups.set(el, cleanups);
  }
  cleanups.push(fn);
}

/**
 * Core binding engine
 */
function apply(el: HTMLElement, instance: RouseController) {
  if (boundNodes.has(el)) return;
  boundNodes.add(el);

  // rz-bind
  if (el.dataset.rzBind) {
    const bindings = el.dataset.rzBind.split(REGEX_SPLIT);
    bindings.forEach((binding) => {
      const match = binding.match(REGEX_PARSE);
      if (!match) return;

      let [, bindType, path] = match;
      bindType = (bindType || '').trim();
      path = (path || '').trim();

      const cleanup = applyBind(el, instance, path, bindType);
      addCleanup(el, cleanup);
    });
  }

  // rz-text
  if (el.dataset.rzText) {
    // Only single controller instance key as value allowed
    const key = el.dataset.rzText;

    const cleanup = applyText(el, instance, key);
    addCleanup(el, cleanup);
  }

  // rz-html
  if (el.dataset.rzHtml) {
    // Only single controller instance key as value allowed
    const key = el.dataset.rzHtml;

    const cleanup = applyHtml(el, instance, key);
    addCleanup(el, cleanup);
  }

  // rz-model
  if (el.dataset.rzModel) {
    // Only single controller instance key as value allowed
    const key = el.dataset.rzModel;

    const cleanup = applyModel(el, instance, key);
    addCleanup(el, cleanup);
  }

  // rz-on
  if (el.dataset.rzOn) {
    const events = el.dataset.rzOn.split(REGEX_SPLIT);
    events.forEach((evtStr) => {
      const match = evtStr.match(REGEX_PARSE);
      if (!match) return;

      const [, evtName, methodName] = match;
      if (!evtName || !methodName) return;
      if (typeof instance[methodName] !== 'function') return;

      const cleanupOn = applyOn(el, instance, evtName, methodName);
      addCleanup(el, cleanupOn);
    });
  }
}

/**
 * Scans for Rouse directives
 */
function scan(el: HTMLElement, instance: RouseController) {
  // Check if the node belongs to this controller to ensure encapsulation
  const nodeOwner = el.closest('[data-rz]');
  if (nodeOwner === el) {
    // Bind the node itself if it has attributes
    if (
      el.dataset.rzBind ||
      el.dataset.rzOn ||
      el.dataset.rzText ||
      el.dataset.rzHtml ||
      el.dataset.rzModel
    ) {
      apply(el, instance);
    }
  }
  const children = el.querySelectorAll<HTMLElement>(DIRECTIVES_QUERY);
  children.forEach((child) => {
    const childOwner = child.closest('[data-rz]');
    // Only bind if the closes data-rz ancestor is this controller
    if (childOwner === el) {
      apply(child, instance);
    }
  });
}

/**
 * Handles cleanups
 */
function teardown(el: HTMLElement) {
  // Clean up the element node itself if it was bound
  const cleanups = elementCleanups.get(el);
  if (cleanups !== undefined) {
    cleanups.forEach((fn) => {
      fn();
    });
    elementCleanups.delete(el);
  }

  // Query the detached tree to find descendants that might need cleanup
  const children = el.querySelectorAll<HTMLElement>(DIRECTIVES_QUERY);
  children.forEach((child) => {
    const cleanups = elementCleanups.get(child);
    if (cleanups !== undefined) {
      cleanups.forEach((fn) => {
        fn();
      });
      elementCleanups.delete(child);
    }
  });
}

/**
 * Binds the controller instance to the DOM.
 * Handles initial bindings and uses MO for dynamic updates and cleanup.
 */
export function attachController(root: HTMLElement, instance: RouseController) {
  // Apply bindings
  apply(root, instance);

  // Run initial scan
  scan(root, instance);

  // Start MutationObserver to monitor nodes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (isElement(node)) {
          scan(node, instance);
        }
      });
      m.removedNodes.forEach((node) => {
        if (isElement(node)) {
          teardown(node);
        }
      });
    });
  });

  observer.observe(root, { childList: true, subtree: true });

  // Lifecycle connection
  if (typeof instance.connect === 'function') {
    instance.connect();
  }

  // Global disconnect
  return () => {
    observer.disconnect();
    for (const [_el, fns] of elementCleanups) {
      fns.forEach((fn) => {
        fn();
      });
    }
    elementCleanups.clear();

    if (typeof instance.disconnect === 'function') {
      instance.disconnect();
    }
  };
}
