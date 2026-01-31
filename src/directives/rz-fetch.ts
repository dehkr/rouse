import { http } from '../net/fetch';
import { swap } from '../dom/utils';

/**
 * Basic fetch handling.
 * Swaps HTML content from a server response without a full page reload.
 * Triggered by 'rz-fetch' on links, forms, or buttons.
 */
export async function handleFetch(el: HTMLElement, loadingClass = 'rz-loading') {
  // Prioritize value in data-rz-fetch
  const url = el.dataset.rzFetch || el.getAttribute('href') || el.getAttribute('action');
  if (!url) return;

  // Prioritize value in data-rz-method
  const method = el.dataset.rzMethod || el.getAttribute('method') || 'GET';
  // If target not provided use the calling element
  const targetSelector = el.dataset.rzTarget || el;
  // Default to innerHTML
  const swapMethod = el.dataset.rzSwap || 'outerHTML';

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
