import { getDirective } from '../dom/attributes';

export const SLUG = 'swap' as const;

export type SwapMethod =
  | 'innerHTML'
  | 'outerHTML'
  | 'beforebegin'
  | 'afterbegin'
  | 'beforeend'
  | 'afterend'
  | 'delete';

/**
 * Retrieves the swap strategy from the element.
 * Defaults to 'innerHTML' if not specified.
 */
export function getSwap(el: HTMLElement): SwapMethod {
  return (getDirective(el, SLUG) as SwapMethod) || 'innerHTML';
}
