import { internalBus } from './bus';
import { createController, composeSetups, controller } from './controller';
import { reactive, effect } from './reactivity';
import { handleFetch } from './fetch';
import { createStore } from './store';
import { dispatch } from './utils';

const registry: Record<string, any> = {};
const instanceMap = new WeakMap<HTMLElement, any>();
const visibilityCallbacks = new WeakMap<HTMLElement, () => void>();

let hasStarted = false;

interface GilliganConfig {
  wake?: string;
  fetch?: boolean;
}

// Initializes a controller on a specific element
function mount(el: HTMLElement) {
  if (instanceMap.has(el)) return;

  const rawNames = el.dataset.gn;
  if (!rawNames) return;

  const names = rawNames.trim().split(/\s+/);
  const defs = names
    .map((name) => {
      if (!registry[name]) {
        console.warn(`[Gilligan] "${name}" not registered.`);
      }
      return registry[name];
    })
    .filter(Boolean);

  if (defs.length > 0) {
    const finalSetup = composeSetups(defs);
    instanceMap.set(el, createController(el, finalSetup));
  }
}

function unmount(el: HTMLElement) {
  const inst = instanceMap.get(el);
  if (inst) {
    inst._unmount();
    instanceMap.delete(el);
  }
}

function register(name: string, controllerDef: any) {
  registry[name] = controllerDef;
}

function start(config: GilliganConfig = {}) {
  if (hasStarted) {
    console.warn('[Gilligan] gn.start() was called multiple times. Ignoring duplicate call.');
    return;
  }
  hasStarted = true;

  const { wake = 'load', fetch = true } = config;

  // Event delegation for fetch
  // Only attach if fetch capability is enabled
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
    ['click', 'submit'].forEach((evt) => document.addEventListener(evt, handleGlobalFetch));
  }

  // Lifecycle observer
  // Handles unmounting removed controllers and mounting added controllers
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.removedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.dataset.gn) {
            unmount(node);
          }
          node.querySelectorAll<HTMLElement>('[data-gn]').forEach(unmount);
        }
      });
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          // Checks if this element needs to be a controller
          initElement(node);
          node.querySelectorAll<HTMLElement>('[data-gn]').forEach(initElement);
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Shared IntersectionObserver for 'visible' wake strategy
  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement;
        const cb = visibilityCallbacks.get(el);

        // Check if a callback exists for handling multiple wake strategies.
        // If yes, run it. Otherwise run mount.
        if (cb) {
          cb();
          visibilityCallbacks.delete(el);
        } else {
          mount(el);
        }

        visibilityObserver.unobserve(entry.target);
      }
    });
  });

  // 6 wake strategies: load (default), visible, idle, interaction, delay, media, event
  const initElement = (el: HTMLElement) => {
    // Check element attribute first, fall back to global config default
    const initAttr = el.dataset.gnWake || wake;

    // Split data-gn-wake value into distinct strategies
    // Matches whitespace followed by keyword
    const strategies = initAttr.split(/\s+(?=(?:load|visible|idle|interaction|delay|media|event))/);

    // Countdown latch: mount only when all strategies are satisfied
    let pending = strategies.length;
    const satisfy = () => {
      if (--pending === 0) {
        mount(el);
      }
    };

    strategies.forEach((str) => {
      const [strategy, ...rest] = str.split('->');
      const param = rest.join('->'); // Rejoin in case param contained '->'

      switch (strategy) {
        // data-gn-wake="load"
        case 'load':
          satisfy();
          break;

        // data-gn-wake="delay->1000"
        case 'delay':
          setTimeout(satisfy, parseInt(param || '0', 10));
          break;

        // data-gn-wake="visible"
        case 'visible':
          // Register a callback for this specific element
          visibilityCallbacks.set(el, satisfy);
          visibilityObserver.observe(el);
          break;

        // data-gn-wake="media->(min-width: 768px)"
        case 'media':
          if (!param) return;
          // MediaQueryList object
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

        // data-gn-wake="event->open-cart"
        case 'event':
          if (!param) return;
          window.addEventListener(param, satisfy, { once: true });
          break;

        // data-gn-wake="interaction"
        case 'interaction':
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

        // data-gn-wake="idle"
        case 'idle':
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(satisfy);
          } else {
            // Fallback for Safari which doesn't support requestIdleCallback currently
            setTimeout(satisfy, 1);
          }
          break;

        default:
          // Default to satisfy in case of unknown strategy so we don't block other valid strategies
          satisfy();
          break;
      }
    });
  };

  // Initial scan
  const controllers = document.querySelectorAll<HTMLElement>('[data-gn]');
  if (controllers.length > 0) {
    controllers.forEach(initElement);
  } else {
    console.log('[Gilligan] No controllers found.');
  }
}

// The public singleton interface
export const Gilligan = {
  // State + logic
  controller,
  reactive,
  effect,
  store: createStore,
  // Events + communication
  dispatch,
  emit: internalBus.emit.bind(internalBus),
  on: internalBus.on.bind(internalBus),
  off: internalBus.off.bind(internalBus),
  // System + lifecycle
  register,
  start,
};

if (typeof window !== 'undefined') {
  (window as any).Gilligan = Gilligan;
  (window as any).gn = Gilligan;
}
