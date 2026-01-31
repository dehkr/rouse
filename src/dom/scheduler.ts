const visibilityCallbacks = new WeakMap<HTMLElement, () => void>();

/**
 * Shared IntersectionObserver for 'visible' wake strategy
 */
const visibilityObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const el = entry.target as HTMLElement;
      const callback = visibilityCallbacks.get(el);
      if (callback) {
        callback();
        visibilityCallbacks.delete(el);
      }
      visibilityObserver.unobserve(el);
    }
  });
});

/**
 * Wakes immediately when document is ready
 */
export function whenLoaded(callback: () => void) {
  if (document.readyState === 'complete') {
    callback();
  } else {
    window.addEventListener('load', callback, { once: true });
  }
}

/**
 * Wakes after provided delay in ms
 */
export function whenDelayOver(delay: number, callback: () => void) {
  setTimeout(callback, delay);
}

/**
 * Wakes when the element is visible or scrolled into view
 */
export function whenVisible(el: HTMLElement, callback: () => void) {
  visibilityCallbacks.set(el, callback);
  visibilityObserver.observe(el);
}

/**
 * Wakes when the media query matches
 */
export function whenMediaMatches(mediaQuery: string, callback: () => void) {
  if (!mediaQuery) {
    callback();
    return;
  }
  const mql = window.matchMedia(mediaQuery);
  if (mql.matches) {
    callback();
  } else {
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        callback();
        mql.removeEventListener('change', handler);
      }
    };
    mql.addEventListener('change', handler);
  }
}

/**
 * Wakes on any custom event
 */
export function whenEvent(event: string, callback: () => void) {
  if (!event) {
    callback();
    return;
  }
  window.addEventListener(event, callback, { once: true });
}

/**
 * Wakes when the user interacts with the element
 */
export function whenInteracted(
  el: HTMLElement,
  callback: () => void,
  triggers: string[] | string = ['mouseover', 'focusin', 'touchstart'],
) {
  const triggerList = Array.isArray(triggers) ? triggers : [triggers];
  let called = false;

  const interactHandler = () => {
    if (called) return;
    called = true;

    callback();
    triggerList.forEach((evt) => {
      el.removeEventListener(evt, interactHandler);
    });
  };
  triggerList.forEach((evt) => {
    el.addEventListener(evt, interactHandler, { passive: true });
  });
}

/**
 * Wakes when the browser is idle
 */
export function whenIdle(callback: () => void) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback);
  } else {
    // Fallback for Safari since it doesn't support requestIdleCallback (as of Jan 2026)
    setTimeout(callback, 1);
  }
}
