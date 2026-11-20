import { effect } from 'alien-signals';
import { warn } from '../core/diagnostics';
import { resolveBoundValue } from '../core/invoke';
import {
  applyStyles,
  setStyleProperty,
  updateAttr,
  updateClass,
  updateHtml,
  updateProp,
  updateStyle,
  updateText,
} from '../dom/updater';
import type { BindableValue, BoundDirective, DirectiveSlug } from '../types';

/**
 * Returns a bound directive that writes the resolved value whenever it changes.
 * `value` is the segment's raw value, empty when the segment is a bare key, which
 * then names the value to resolve.
 *
 * Pass `{ singleValue: true }` for a directive that ignores `key`, such as `rz-text`.
 * Several values would write the same element from competing effects.
 */
function writerDirective(
  slug: DirectiveSlug,
  write: (el: Element, key: string, resolved: BindableValue, value: string) => void,
  options?: { singleValue?: boolean },
): BoundDirective {
  return {
    slug,
    singleValue: options?.singleValue,
    bind(el, scope, app, key, value) {
      return [
        effect(() => {
          write(
            el,
            key,
            resolveBoundValue(value || key, scope, app.stores, el, slug),
            value,
          );
        }),
      ];
    },
  };
}

export const rzText = writerDirective(
  'text',
  (el, _key, resolved) => updateText(el, resolved),
  {
    singleValue: true,
  },
);

export const rzHtml = writerDirective(
  'html',
  (el, _key, resolved) => updateHtml(el, resolved),
  {
    singleValue: true,
  },
);

export const rzProp = writerDirective('prop', (el, key, resolved) =>
  updateProp(el, key, resolved),
);

export const rzClass = writerDirective('class', (el, key, resolved, value) =>
  updateClass(el, value === '' ? resolved : { [key]: !!resolved }),
);

export const rzStyle = writerDirective('style', (el, key, resolved, value) => {
  if (value === '') {
    updateStyle(el, resolved);
  } else if (key.includes(':')) {
    applyStyles(el, key, !!resolved);
  } else {
    setStyleProperty(el, key, resolved);
  }
});

const attrWriter = writerDirective('attr', (el, key, resolved) =>
  updateAttr(el, key, resolved),
);

export const rzAttr: BoundDirective = {
  ...attrWriter,
  bind(el, scope, app, key, value) {
    // Written as attributes, these would wipe the classes and styles the markup and
    // rz-class or rz-style set, so each has its own directive.
    const name = key.toLowerCase();
    if (name === 'class' || name === 'style') {
      if (__DEV__) {
        warn(`rz-attr: '${key}' belongs on data-rz-${name}. Ignoring.`, el);
      }
      return [];
    }
    return attrWriter.bind(el, scope, app, key, value);
  },
};
