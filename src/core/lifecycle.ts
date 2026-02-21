import { getTuningStrategy } from '../directives';
import { configureDirectivePrefix, hasDirective, selector } from '../directives/prefix';
import { handleFetch } from '../directives/rz-fetch';
import { initElement, initObserver } from '../dom/initializer';
import { configureClient } from '../net/request';
import type { NetworkInterceptors } from '../types';

export const defaultConfig = {
  loadingClass: 'rz-loading',
  root: document.body as string | HTMLElement,
  useDataAttr: false,
  wake: 'load',
  baseUrl: '' as string | undefined,
  headers: {} as HeadersInit | undefined,
  interceptors: undefined as NetworkInterceptors | undefined,
};

export type RouseConfig = Partial<typeof defaultConfig>;

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
    loadingClass = defaultConfig.loadingClass,
    root = defaultConfig.root,
    useDataAttr = defaultConfig.useDataAttr,
    wake = defaultConfig.wake,
    baseUrl,
    headers,
    interceptors,
  } = config;

  configureDirectivePrefix(useDataAttr);

  configureClient({ baseUrl, headers, interceptors });

  const rootEl =
    typeof root === 'string' ? (document.querySelector(root) as HTMLElement) : root;

  if (!rootEl) {
    console.warn('[Rouse] Root element not found:', root);
    return;
  }

  // Attach global fetch handling event listeners
  const handleGlobalFetch = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(selector('fetch'));

    if (target) {
      const tune = getTuningStrategy(target);

      // If triggers are present only fire on those events
      // TODO: add warning if user-supplied trigger is not supported
      if (tune.trigger && tune.trigger.length > 0) {
        if (tune.trigger.includes(e.type)) {
          e.preventDefault();
          handleFetch(target, loadingClass);
        }
        return;
      }

      const tagName = target.tagName;
      const isForm = tagName === 'FORM';
      const isInput =
        tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';

      // Forms: trigger on submit
      if (isForm && e.type === 'submit') {
        e.preventDefault();
        handleFetch(target, loadingClass);
        return;
      }

      // Inputs: trigger on input or change (ignore clicks)
      if (isInput && (e.type === 'input' || e.type === 'change')) {
        handleFetch(target, loadingClass);
        return;
      }

      // Everything else trigger on click
      if (!isForm && !isInput && e.type === 'click') {
        e.preventDefault();
        handleFetch(target, loadingClass);
      }
    }
  };

  // Bubbling events only
  const events = [
    'click',
    'dblclick',
    'submit',
    'input',
    'change',
    'keyup',
    'keydown',
    'mouseover',
    'mouseout',
    'focusin',
    'focusout',
    'pointerdown',
    'pointerup',
  ];

  events.forEach((evt) => {
    document.addEventListener(evt, handleGlobalFetch);
  });

  // Start observer to scan for Rouse controllers
  const controllerObserver = initObserver(wake);
  controllerObserver.observe(rootEl, { childList: true, subtree: true });

  // Initial scan
  if (hasDirective(rootEl, 'use')) {
    initElement(rootEl, wake);
  }

  const controllers = rootEl.querySelectorAll<HTMLElement>(selector('use'));
  controllers.forEach((el) => {
    initElement(el, wake);
  });

  // Initial scan for auto-fetching elements and custom triggers
  const fetchNodes = rootEl.querySelectorAll<HTMLElement>(selector('fetch'));
  
  fetchNodes.forEach((el) => {
    const tune = getTuningStrategy(el);
    
    if (tune.trigger && tune.trigger.length > 0) {
      // Auto-start on 'load'
      if (tune.trigger.includes('load')) {
        handleFetch(el, loadingClass);
      }
      
      // Attach direct listeners for custom events
      tune.trigger.forEach((evt) => {
        if (evt !== 'load' && evt !== 'none' && !events.includes(evt)) {
          el.addEventListener(evt, (e) => {
            e.preventDefault();
            handleFetch(el, loadingClass);
          });
        }
      });
    }
  });
}
