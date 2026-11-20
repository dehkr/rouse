import { updateText } from '../dom/updater';
import { writerDirective } from './define-bound-writer';

export const rzText = writerDirective(
  'text',
  (el, _key, resolved) => updateText(el, resolved),
  {
    singleValue: true,
  },
);
