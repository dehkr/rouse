import type { InsertMethod } from '../core/constants';
import type { BoundCleanupFn, VoidFn } from '../types';
import { dispatch } from './scheduler';

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
 * Returns the most appropriate default trigger for an element.
 *
 *  - `submit` for Form elements
 *  - `change` for Input, TextArea, and Select elements
 *  - `click` for everything else
 */
export function defaultTriggerFor(el: Element): string {
  if (is(el, 'Form')) return 'submit';
  if (is(el, 'Input') || is(el, 'Select') || is(el, 'TextArea')) return 'change';
  return 'click';
}

/**
 * Handles inserting HTML partials into document
 */
export function insert(
  content: string,
  target: Element,
  method: InsertMethod = 'innerHTML',
  source: 'fetch' | 'programmatic' = 'programmatic',
) {
  const dispatcherEl =
    method === 'outerHTML' || method === 'delete'
      ? target.parentElement || target
      : target;

  const beforeEvent = dispatch(
    dispatcherEl,
    'rz:dom:update:before',
    { target, strategy: method, payload: content, source },
    { cancelable: true },
  );

  if (beforeEvent.defaultPrevented) return;
  const finalContent = beforeEvent.detail.payload;

  switch (method) {
    case 'delete':
      target.remove();
      break;
    case 'innerHTML':
      target.innerHTML = finalContent;
      break;
    case 'outerHTML':
      target.outerHTML = finalContent;
      break;
    default:
      target.insertAdjacentHTML(method, finalContent);
  }

  dispatch(dispatcherEl, 'rz:dom:update', {
    target,
    strategy: method,
    payload: finalContent,
    source,
  });
}

/**
 * Factory function to wrap cleanup logic and apply 'CLEANUP' identifier.
 * Used for directives of `BoundDirective` type.
 */
export function boundCleanup(fn: VoidFn): BoundCleanupFn {
  return fn as BoundCleanupFn;
}
