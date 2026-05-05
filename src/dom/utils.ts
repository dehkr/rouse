import type { BoundCleanupFn, InsertMethod, VoidFn } from '../types';

const elementMap = {
  Anchor: HTMLAnchorElement,
  Form: HTMLFormElement,
  HTML: HTMLElement,
  Input: HTMLInputElement,
  Script: HTMLScriptElement,
  Select: HTMLSelectElement,
  SVG: SVGElement,
  TextArea: HTMLTextAreaElement,
} as const;

type ElementKind = keyof typeof elementMap;

export function is<K extends ElementKind>(
  el: unknown,
  kind: K,
): el is InstanceType<(typeof elementMap)[K]> {
  return el instanceof elementMap[kind];
}

export function isNativeNavigation(el: Element, e: Event): boolean {
  return (
    (e.type === 'submit' && is(el, 'Form')) || (e.type === 'click' && is(el, 'Anchor'))
  );
}

/**
 * Handles inserting HTML partials into document
 */
export function insert(
  content: string,
  target: Element,
  method: InsertMethod = 'innerHTML',
) {
  switch (method) {
    case 'delete':
      target.remove();
      break;
    case 'innerHTML':
      target.innerHTML = content;
      break;
    case 'outerHTML':
      target.outerHTML = content;
      break;
    default:
      target.insertAdjacentHTML(method, content);
  }
}

/**
 * Factory function to wrap cleanup logic and apply 'CLEANUP' identifier.
 * Used for directives of `BoundDirective` type.
 */
export function boundCleanup(fn: VoidFn): BoundCleanupFn {
  return fn as BoundCleanupFn;
}
