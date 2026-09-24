import { effect } from 'alien-signals';
import type { RouseApp } from '../core/app';
import { directiveSelector } from '../core/attributes';
import { resolveBoundValue } from '../core/invoke';
import type {
  BindableValue,
  BoundCleanupFn,
  BoundDirective,
  DirectiveSlug,
  Scope,
} from '../types';

/**
 * Factory for the bound-writer directives (rz-attr, rz-text, rz-html, rz-prop).
 * Resolves a bound value inside an effect and writes it to the element.
 *
 * `rz-attr` and `rz-prop` take multiple comma-separated values, since `key` names the attribute
 * or property. `rz-text` and `rz-html` take a bare value and ignore `key`, so pass
 * `{ singleValue: true }` for them. Multiple values would write the same element from
 * competing effects.
 */
export function defineBoundWriterDirective(
  slug: DirectiveSlug,
  write: (el: Element, key: string, val: BindableValue) => void,
  options?: { singleValue?: boolean },
): BoundDirective {
  return {
    slug,
    selector: directiveSelector(slug),
    singleValue: options?.singleValue,
    bind(
      el: Element,
      scope: Scope,
      app: RouseApp,
      key: string,
      value: string,
    ): BoundCleanupFn {
      const raw = value || key;
      return effect(() => {
        write(el, key, resolveBoundValue(raw, scope, app.stores, el, slug));
      }) as BoundCleanupFn;
    },
  };
}
