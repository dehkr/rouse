// Store active promises for URLs to prevent duplicate fetches
const cache = new Map<string, Promise<void>>();

/**
 * Dynamically loads an external script or stylesheet and inserts into <head>.
 *
 * @param url - The URL of the resource to load.
 * @returns A promise that resolves when the resource is loaded.
 */
export function load(url: string): Promise<void> {
  const cachedValue = cache.get(url);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const isCSS = url.endsWith('.css');
    let element: HTMLElement;

    if (isCSS) {
      element = document.createElement('link');
      (element as HTMLLinkElement).rel = 'stylesheet';
      (element as HTMLLinkElement).href = url;
    } else {
      element = document.createElement('script');
      (element as HTMLScriptElement).src = url;
      (element as HTMLScriptElement).async = true;
    }

    element.onload = () => resolve();
    element.onerror = () => {
      // Remove from cache so we can try again if needed
      cache.delete(url);
      reject(new Error(`[Rouse] Failed to load ${url}`));
    };

    document.head.appendChild(element);
  });

  cache.set(url, promise);
  return promise;
}
