import { controller, createController } from '../dom/controller';
import { handleFetch } from '../net/fetch';
import { load } from '../net/load';
import { effect, reactive } from '../reactivity/';
import type { SetupFn } from '../types';
import { dispatch } from '../utils/dispatch';
import { isElt } from '../utils/is';
import { bus } from './bus';
import { createStore } from './store';

const registry: Record<string, SetupFn> = {};
const instanceMap = new WeakMap<HTMLElement, any>();
const visibilityCallbacks = new WeakMap<HTMLElement, () => void>();
let hasStarted = false;

interface GilliganConfig {
  wake?: string; // Default: 'load'
  fetch?: boolean; // Default: true
  root?: string | HTMLElement; // Default: document.body
  loadingClass?: string; // Default: 'gn-loading'
}

// Initializes a controller on a specific element
function mountInstance(el: HTMLElement, setup: SetupFn, loadingClass: string) {
  if (instanceMap.has(el)) return;
  instanceMap.set(el, createController(el, setup, loadingClass));
}

function unmountInstance(el: HTMLElement) {
  const inst = instanceMap.get(el);
  if (inst) {
    // Trigger disconnect() lifecycle and cleanup
    inst._unmount();
    instanceMap.delete(el);
  }
}

// Initialize element
function initElement(el: HTMLElement, defaultWake: string, loadingClass: string) {
  const rawName = el.dataset.gn;
  if (!rawName) return;

  const name = rawName.trim();

  const setup = registry[name];
  if (!setup) {
    console.warn(`[Gilligan] Controller "${name}" is not registered.`);
    return;
  }

  // Parse wake strategy
  const wakeAttr = el.dataset.gnWake || defaultWake;
  const strategies = wakeAttr.split(
    /\s+(?=(?:load|visible|idle|interaction|delay|media|event))/,
  );

  // Wake triggers only when all conditions are satisfied
  let pending = strategies.length;
  const satisfy = () => {
    if (--pending === 0) {
      mountInstance(el, setup, loadingClass);
    }
  };

  // Strategy Logic
  strategies.forEach((str) => {
    const [strategy, ...rest] = str.split('->');
    const param = rest.join('->');

    switch (strategy) {
      case 'load': {
        satisfy();
        break;
      }
      case 'delay': {
        setTimeout(satisfy, parseInt(param || '0', 10));
        break;
      }
      case 'visible': {
        visibilityCallbacks.set(el, satisfy);
        visibilityObserver.observe(el);
        break;
      }
      case 'media': {
        if (!param) {
          satisfy();
          return;
        }
        const mql = window.matchMedia(param);
        if (mql.matches) {
          satisfy();
        } else {
          const handler = (e: MediaQueryListEvent) => {
            if (e.matches) {
              satisfy();
              mql.removeEventListener('change', handler);
            }
          };
          mql.addEventListener('change', handler);
        }
        break;
      }
      case 'event': {
        if (!param) {
          satisfy();
          return;
        }
        window.addEventListener(param, satisfy, { once: true });
        break;
      }
      case 'interaction': {
        const interactions = ['mouseover', 'focusin', 'touchstart'];
        const interactHandler = () => {
          satisfy();
          interactions.forEach((evt) => {
            el.removeEventListener(evt, interactHandler);
          });
        };
        interactions.forEach((evt) => {
          el.addEventListener(evt, interactHandler, { passive: true, once: true });
        });
        break;
      }
      case 'idle': {
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(satisfy);
        } else {
          // Fallback for Safari since it doesn't support requestIdleCallback currently
          setTimeout(satisfy, 1);
        }
        break;
      }
      default: {
        satisfy();
        break;
      }
    }
  });
}

// Shared IntersectionObserver for 'visible' wake strategy
const visibilityObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const el = entry.target as HTMLElement;
      const cb = visibilityCallbacks.get(el);
      if (cb) {
        cb();
        visibilityCallbacks.delete(el);
      }
      visibilityObserver.unobserve(el);
    }
  });
});

function register(name: string, setup: SetupFn<any>) {
  registry[name] = setup;
}

/**
 * Starts the Gilligan framework.
 * Accepts a root element, a config object, or both.
 */
function start(arg1?: string | HTMLElement | GilliganConfig, arg2?: GilliganConfig) {
  if (hasStarted) {
    console.warn('[Gilligan] gn.start() called multiple times. Ignoring.');
    return;
  }
  hasStarted = true;

  let root: string | HTMLElement = document.body;
  let config: GilliganConfig = {};

  // Parse arguments
  if (typeof arg1 === 'string' || isElt(arg1)) {
    root = arg1;
    config = arg2 || {};
  } else if (typeof arg1 === 'object') {
    config = arg1;
    if (config.root) {
      root = config.root;
    }
  }

  const { wake = 'load', fetch = true, loadingClass = 'gn-loading' } = config;

  const rootEl =
    typeof root === 'string' ? (document.querySelector(root) as HTMLElement) : root;

  if (!rootEl) {
    console.warn('[Gilligan] Root element not found:', root);
    return;
  }

  // Attach global fetch handling event listeners
  if (fetch) {
    const handleGlobalFetch = (e: Event) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-gn-fetch]');
      if (target) {
        const isForm = target.tagName === 'FORM';
        if ((e.type === 'submit' && isForm) || (e.type === 'click' && !isForm)) {
          e.preventDefault();
          handleFetch(target);
        }
      }
    };
    ['click', 'submit'].forEach((evt) => {
      document.addEventListener(evt, handleGlobalFetch);
    });
  }

  // Watch for elements with controller (data-gn) attribute
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.removedNodes.forEach((node) => {
        if (isElt(node)) {
          if (node.dataset.gn) {
            unmountInstance(node);
          }
          node.querySelectorAll<HTMLElement>('[data-gn]').forEach(unmountInstance);
        }
      });
      m.addedNodes.forEach((node) => {
        if (isElt(node)) {
          if (node.dataset.gn) {
            initElement(node, wake, loadingClass);
          }
          node.querySelectorAll<HTMLElement>('[data-gn]').forEach((el) => {
            initElement(el, wake, loadingClass);
          });
        }
      });
    });
  });

  observer.observe(rootEl, { childList: true, subtree: true });

  // Initial scan
  if (rootEl.dataset.gn) {
    initElement(rootEl, wake, loadingClass);
  }
  const controllers = rootEl.querySelectorAll<HTMLElement>('[data-gn]');
  controllers.forEach((el) => {
    initElement(el, wake, loadingClass);
  });
}

// The public singleton interface
export const Gilligan = {
  controller,
  reactive,
  effect,
  store: createStore,
  dispatch,
  bus,
  load,
  register,
  start,
};

if (typeof window !== 'undefined') {
  (window as any).Gilligan = Gilligan;
  (window as any).gn = Gilligan;
}
