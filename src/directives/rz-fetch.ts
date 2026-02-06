import { swap } from '../dom/utils';
import { http } from '../net/fetch';
import { getDirective } from './prefix';
import { getMethod } from './rz-method';
import { getSwap } from './rz-swap';
import { getTarget } from './rz-target';

export const SLUG = 'fetch' as const;

/**
 * Basic fetch handling.
 * Swaps HTML content from a server response without a full page reload.
 * Triggered by 'rz-fetch' on links, forms, or buttons.
 */
export async function handleFetch(el: HTMLElement, loadingClass = 'rz-loading') {
  // Prioritize value in rz-fetch
  const url = getDirective(el, SLUG) || el.getAttribute('href') || el.getAttribute('action');
  if (!url) return;

  const method = getMethod(el);
  const targetSelector = getTarget(el);
  const swapMethod = getSwap(el);

  // TODO: Add to target element instead or in addition to?
  el.classList.add(loadingClass);
  el.setAttribute('aria-busy', 'true');

  try {
    const html = await http(url, {
      method,
      serializeForm: el instanceof HTMLFormElement ? el : undefined,
    });

    // Update DOM
    if (targetSelector) {
      const target =
        typeof targetSelector === 'string'
          ? document.querySelector(targetSelector)
          : targetSelector;

      if (target) {
        swap(target as HTMLElement, html, swapMethod);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    el.classList.remove(loadingClass);
    el.setAttribute('aria-busy', 'false');
  }
};
