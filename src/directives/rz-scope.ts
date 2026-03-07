import { splitInjection } from '../dom/utils';
import { getDirective } from './prefix';

export const SLUG = 'scope' as const;

export function getControllerName(el: HTMLElement): string | null {
  const raw = getDirective(el, SLUG);
  return raw ? splitInjection(raw).key : null;
}
