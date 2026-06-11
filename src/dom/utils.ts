import type { InsertMethod } from '../core/constants';
import { warn } from '../core/shared';
import type { BoundCleanupFn, DirectiveSlug, TriggerDef, VoidFn } from '../types';
import { dispatch } from './scheduler';

const elementMap = {
  Anchor: HTMLAnchorElement,
  Button: HTMLButtonElement,
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
 * Returns the native default trigger for an element, or `null` when the
 * element has no native default action and therefore requires an explicit
 * trigger.
 */
export function defaultTriggerFor(el: Element): string | null {
  if (is(el, 'Form')) return 'submit';
  if (is(el, 'Anchor') || is(el, 'Button')) return 'click';
  if (is(el, 'Input') && ['submit', 'button', 'reset', 'image'].includes(el.type))
    return 'click';
  if (is(el, 'Input') || is(el, 'Select') || is(el, 'TextArea')) return 'change';

  return null;
}

/**
 * Resolves a parsed trigger to a `TriggerDef`. Warns and returns `null` for
 * non-interactive elements that have no native default.
 */
export function resolveDefaultTrigger(
  trigger: TriggerDef | null,
  el: Element,
  slug: DirectiveSlug,
): TriggerDef | null {
  if (trigger) return trigger;

  const event = defaultTriggerFor(el);
  if (!event) {
    warn(`rz-${slug} on <${el.tagName.toLowerCase()}> needs an explicit trigger.`);
    return null;
  }

  return { event, modifiers: [] };
}

/**
 * Handles inserting HTML partials into the DOM.
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
