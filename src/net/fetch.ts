/**
 * Basic fetch handling.
 * Swaps HTML content from a server response without a full page reload.
 * Triggered by 'data-gn-fetch' on links, forms, or buttons.
 */
export const handleFetch = async (el: HTMLElement) => {
  const ds = el.dataset;
  const cl = el.classList;
  const ga = (a: string) => el.getAttribute(a);
  const sa = (a: string, v: string) => el.setAttribute(a, v);

  // Prioritize value in data-gn-fetch
  const url = ds.gnFetch || ga('href') || ga('action');
  if (!url) return;

  // Prioritize value in data-gn-method
  const method = ds.gnMethod || ga('method') || 'GET';
  // If target not provided use the calling element
  const target = ds.gnTarget || el;
  // Default to innerHTML
  const swapMethod = ds.gnSwap || 'outerHTML';

  // Add class while loading
  // TODO: Add to target element instead or in addition to?
  cl.add('gn-loading');
  sa('aria-busy', 'true');

  try {
    const options: RequestInit = {
      method: method.toUpperCase(),
      headers: { 'GN-Request': 'true' },
    };

    // Serialize form data
    if (el.tagName === 'FORM') {
      options.body = new FormData(el as HTMLFormElement);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`[gn] Fetch failed: ${response.status}`);
    }

    const html = await response.text();

    if (target) {
      const targetEl =
        typeof target === 'string' ? document.querySelector(target) : target;

      if (targetEl) {
        swapMethod === 'innerHTML' || swapMethod === 'outerHTML'
          ? (targetEl[swapMethod] = html)
          : targetEl.insertAdjacentHTML(swapMethod as InsertPosition, html);
      }
    }
  } catch (error) {
    console.error('[gn] Fetch failed:', error);
  } finally {
    cl.remove('gn-loading');
    sa('aria-busy', 'false');
  }
};
