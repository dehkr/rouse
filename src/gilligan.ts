import { internalBus } from './bus';
import { createController, composeSetups, controller } from './controller';
import { reactive, effect } from './reactivity';
import { handleFetch } from './fetch';
import { createStore } from './store';
import { dispatch } from './utils';

const registry: Record<string, any> = {};
const instanceMap = new WeakMap<HTMLElement, any>();

interface GilliganConfig {
  init?:
    | 'load'
    | 'visible'
    | 'idle'
    | 'interaction'
    | `delay->${number}`
    | `media->${string}`
    | `event->${string}`;
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
  const { init = 'visible', fetch = true } = config;

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
  // Handles unmounting removed controllers and initializing added controllers
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
          initElement(node);
          node.querySelectorAll<HTMLElement>('[data-gn]').forEach(initElement);
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Shared IntersectionObserver for 'visible' initialization strategy
  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        mount(entry.target as HTMLElement);
        visibilityObserver.unobserve(entry.target);
      }
    });
  });

  // Initialization logic
  // 6 init options: load, delay, media, event, interaction, visible (default)
  const initElement = (el: HTMLElement) => {
    // Check element attribute first, fall back to global config default
    const initAttr = el.dataset.gnInit || init;
    const [strategy, param] = initAttr.split('->');

    switch (strategy) {
      // data-gn-init="load"
      case 'load':
        mount(el);
        break;

      // data-gn-init="delay->1000"
      case 'delay':
        setTimeout(() => mount(el), parseInt(param || '0', 10));
        break;

      // data-gn-init="media->(min-width: 768px)"
      case 'media':
        if (!param) return;
        // MediaQueryList object
        const mql = window.matchMedia(param);
        if (mql.matches) {
          mount(el);
        } else {
          const handler = (e: MediaQueryListEvent) => {
            if (e.matches) {
              mount(el);
              mql.removeEventListener('change', handler);
            }
          };
          mql.addEventListener('change', handler);
        }
        break;

      // data-gn-init="event->open-cart"
      case 'event':
        if (!param) return;
        window.addEventListener(param, () => mount(el), { once: true });
        break;

      // data-gn-init="interaction"
      case 'interaction':
        const interactions = ['mouseover', 'focusin', 'touchstart'];
        const interactHandler = () => {
          mount(el);
          interactions.forEach((evt) => {
            el.removeEventListener(evt, interactHandler);
          });
        };
        interactions.forEach((evt) => {
          el.addEventListener(evt, interactHandler, { passive: true, once: true });
        });
        break;

      // Usage: data-gn-init="visible"
      case 'visible':
      default:
        visibilityObserver.observe(el);
        break;
    }
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
