import { handleFetch } from '../directives/rz-fetch';
import { initElement, initObserver } from '../dom/initializer';

export interface RouseConfig {
  wake?: string;
  fetch?: boolean;
  root?: string | HTMLElement;
  loadingClass?: string;
}

export const defaultConfig: RouseConfig = {
  wake: 'load',
  fetch: true,
  root: document.body,
  loadingClass: 'rz-loading',
};

let hasStarted = false;

/**
 * Starts the Rouse framework.
 * @param config - Optional configuration settings.
 */
export function start(config: RouseConfig = {}) {
  if (hasStarted) {
    console.warn('[Rouse] Rouse.start() called multiple times. Ignoring.');
    return;
  }
  hasStarted = true;

  const {
    wake = defaultConfig.wake as string,
    fetch = defaultConfig.fetch as boolean,
    root = defaultConfig.root as HTMLElement,
    loadingClass = defaultConfig.loadingClass as string,
  } = config;

  const rootEl =
    typeof root === 'string' ? (document.querySelector(root) as HTMLElement) : root;

  if (!rootEl) {
    console.warn('[Rouse] Root element not found:', root);
    return;
  }

  // Attach global fetch handling event listeners
  if (fetch) {
    const handleGlobalFetch = (e: Event) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-rz-fetch]');
      if (target) {
        const isForm = target.tagName === 'FORM';
        if ((e.type === 'submit' && isForm) || (e.type === 'click' && !isForm)) {
          e.preventDefault();
          handleFetch(target, loadingClass);
        }
      }
    };
    ['click', 'submit'].forEach((evt) => {
      document.addEventListener(evt, handleGlobalFetch);
    });
  }

  // Start observer to scan for Rouse controllers
  const controllerObserver = initObserver(wake);
  controllerObserver.observe(rootEl, { childList: true, subtree: true });

  // Initial scan
  if (rootEl.dataset.rz) {
    initElement(rootEl, wake);
  }

  const controllers = rootEl.querySelectorAll<HTMLElement>('[data-rz]');
  controllers.forEach((el) => {
    initElement(el, wake);
  });
}
