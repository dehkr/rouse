import { warn } from '../core/diagnostics';
import { updateAttr } from '../dom/updater';
import type { BoundDirective } from '../types';
import { writerDirective } from './define-bound-writer';

const writer = writerDirective('attr', (el, key, resolved) =>
  updateAttr(el, key, resolved),
);

export const rzAttr: BoundDirective = {
  ...writer,
  bind(el, scope, app, key, value) {
    // Written as attributes, these would wipe the classes and styles the markup and
    // rz-class or rz-style set, so each has its own directive.
    const name = key.toLowerCase();
    if (name === 'class' || name === 'style') {
      if (__DEV__) {
        warn(`rz-attr: '${key}' belongs on data-rz-${name}. Ignoring.`, el);
      }
      return undefined;
    }
    return writer.bind(el, scope, app, key, value);
  },
};
