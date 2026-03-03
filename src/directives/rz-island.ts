import { splitInjection } from '../dom/utils';
import { getDirective } from './prefix';

export const SLUG = 'island' as const;

export function getControllerName(el: HTMLElement): string | null {
  const raw = getDirective(el, SLUG);
  return raw ? splitInjection(raw).key : null;
}
