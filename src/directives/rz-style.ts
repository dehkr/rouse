import { applyStyles, setStyleProperty, updateStyle } from '../dom/updater';
import { writerDirective } from './define-bound-writer';

export const rzStyle = writerDirective('style', (el, key, resolved, value) => {
  if (value === '') {
    updateStyle(el, resolved);
  } else if (key.includes(':')) {
    applyStyles(el, key, !!resolved);
  } else {
    setStyleProperty(el, key, resolved);
  }
});
