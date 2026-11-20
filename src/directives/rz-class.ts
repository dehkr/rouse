import { updateClass } from '../dom/updater';
import { writerDirective } from './define-bound-writer';

export const rzClass = writerDirective('class', (el, key, resolved, value) =>
  updateClass(el, value === '' ? resolved : { [key]: !!resolved }),
);
