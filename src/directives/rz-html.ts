import { updateHtml } from '../dom/updater';
import { writerDirective } from './define-bound-writer';

export const rzHtml = writerDirective(
  'html',
  (el, _key, resolved) => updateHtml(el, resolved),
  {
    singleValue: true,
  },
);
