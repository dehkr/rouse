import { updateProp } from '../dom/updater';
import { writerDirective } from './define-bound-writer';

export const rzProp = writerDirective('prop', (el, key, resolved) =>
  updateProp(el, key, resolved),
);
