import { effect } from 'alien-signals';
import { resolveBoundValue } from '../core/invoke';
import type {
  BindableValue,
  BoundCleanupFn,
  BoundDirective,
  DirectiveSlug,
} from '../types';

/**
 * Returns a bound directive that writes the resolved value whenever it changes.
 * `value` is the segment's raw value, empty when the segment is a bare key, which
 * then names the value to resolve.
 *
 * Pass `{ singleValue: true }` for a directive that ignores `key`, such as `rz-text`.
 * Several values would write the same element from competing effects.
 */
export function writerDirective(
  slug: DirectiveSlug,
  write: (el: Element, key: string, resolved: BindableValue, value: string) => void,
  options?: { singleValue?: boolean },
): BoundDirective {
  return {
    slug,
    singleValue: options?.singleValue,
    bind(el, scope, app, key, value) {
      return effect(() => {
        write(
          el,
          key,
          resolveBoundValue(value || key, scope, app.stores, el, slug),
          value,
        );
      }) as BoundCleanupFn;
    },
  };
}
