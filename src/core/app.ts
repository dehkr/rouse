import { getTuningStrategy } from '../directives';
import { hasDirective, selector } from '../directives/prefix';
import { destroyInstance } from '../dom/controller';
import {
  cleanupStoreElement,
  initControllerElement,
  initObserver,
  initStoreElement,
} from '../dom/initializer';
import { initDomMutator } from '../dom/mutator';
import { cleanupFetch, handleFetch } from '../net/engine';
import type { NetworkInterceptors, RouseReqOpts, RouseTuneOpts, SetupFn } from '../types';
import { EventBus } from './bus';
import { Registry } from './registry';
import { StoreManager } from './store';

export const defaultConfig = {
  loadingClass: 'rz-loading',
  wake: 'load',
  baseUrl: '',
  tune: {} as RouseTuneOpts,
  request: {} as RouseReqOpts,
  interceptors: {} as NetworkInterceptors,
};

export type RouseConfig = Partial<typeof defaultConfig> & {
  root?: string | HTMLElement;
};

// Private map for isolating Rouse instances
const appInstances = new WeakMap<HTMLElement, RouseApp>();

const fail = (reason: string): never => {
  throw new Error(`[Rouse] Registration failed: ${reason}`);
};

export class RouseApp {
  public root: HTMLElement;
  public bus: EventBus;
  public stores: StoreManager;
  public registry: Registry;
  public config: typeof defaultConfig;

  private _hasStarted = false;
  private _observer?: MutationObserver;
  private _handleGlobalFetch?: (e: Event) => void;
  private _events = [
    'change',
    'click',
    'dblclick',
    'focusin',
    'focusout',
    'input',
    'keydown',
    'keyup',
    'mouseout',
    'mouseover',
    'pointerdown',
    'pointerup',
    'submit',
  ];

  constructor(config: RouseConfig = {}) {
    const rootEl =
      typeof config.root === 'string'
        ? (document.querySelector(config.root) as HTMLElement)
        : config.root || document.body;

    if (!rootEl) {
      throw new Error('[Rouse] Root element not found.');
    }

    // Only one instance per element allowed
    if (appInstances.has(rootEl)) {
      throw new Error('[Rouse] An app instance is already attached to this element.');
    }

    this.config = {
      loadingClass: config.loadingClass ?? defaultConfig.loadingClass,
      wake: config.wake ?? defaultConfig.wake,
      baseUrl: config.baseUrl ?? defaultConfig.baseUrl,
      tune: config.tune ?? defaultConfig.tune,
      request: config.request ?? defaultConfig.request,
      interceptors: config.interceptors ?? defaultConfig.interceptors,
    };

    this.root = rootEl;
    this.bus = new EventBus();
    this.stores = new StoreManager(this.config);
    this.registry = new Registry();

    // Mark root so children can find parent app
    this.root.setAttribute('data-rouse-app', '');
    appInstances.set(this.root, this);
  }

  /**
   * Registers one or multiple controllers to the application.
   *
   * @example
   * // Single registration
   * app.register('counter', counter);
   * app.register('cart', cart);
   *
   * @example
   * // Object shorthand for bulk registration
   * app.register({ counter, cart });
   *
   * @param nameOrControllers - Either the unique string name of a controller, or an object mapping names to setup functions.
   * @param setup - The setup function (only required when the first argument is a string).
   */
  register<P extends Record<string, any>>(name: string, setup: SetupFn<P>): this;
  register(controllers: Record<string, SetupFn<any>>): this;
  register(
    nameOrControllers: string | Record<string, SetupFn<any>>,
    setup?: SetupFn<any>,
  ): this {
    if (typeof nameOrControllers === 'string') {
      // Handle single registration
      if (typeof setup === 'function') {
        this.registry.register(nameOrControllers, setup);
      } else {
        fail(`A valid setup function is required for "${nameOrControllers}".`);
      }
    } else if (
      // Handle bulk registration using object shorthand
      nameOrControllers &&
      typeof nameOrControllers === 'object' &&
      !Array.isArray(nameOrControllers)
    ) {
      for (const [name, fn] of Object.entries(nameOrControllers)) {
        if (typeof fn === 'function') {
          this.registry.register(name, fn);
        } else {
          fail(`Controller "${name}" must be a setup function.`);
        }
      }
    } else {
      // Catch-all for everything else
      const received =
        nameOrControllers === null
          ? 'null'
          : Array.isArray(nameOrControllers)
            ? 'an array'
            : typeof nameOrControllers;
      fail(
        `Expected a string name or an object of controllers, but received ${received}.`,
      );
    }

    return this;
  }

  /**
   * Creates a new reactive store.
   */
  addStore(name: string, state: object, config?: any) {
    this.stores.define(name, state, config);
    return this;
  }

  /**
   * Trigger a Rouse network request.
   *
   * @param resource - The URL to fetch.
   * @param options - Network configuration, including the DOM `target`.
   */
  public async fetch(resource: string, options: RouseReqOpts = {}) {
    const targetRef = options.target || document.body;
    const el =
      typeof targetRef === 'string'
        ? document.querySelector<HTMLElement>(targetRef)
        : targetRef;

    if (!el) {
      console.error(`[Rouse] Fetch failed. Target element not found:`, targetRef);
      return;
    }

    options.url = resource;

    return handleFetch(el, options);
  }

  /**
   * Starts the Rouse app instance. Sets up the global fetch handler.
   */
  start() {
    if (this._hasStarted) {
      console.warn('[Rouse] Rouse.start() called multiple times. Ignoring.');
      return;
    }
    this._hasStarted = true;

    this.root.dispatchEvent(
      new CustomEvent('rz:app:start', {
        bubbles: true,
        detail: { app: this },
      }),
    );

    // Initialize the DOM mutator that watches for HTML fetch responses
    initDomMutator(this.root);

    const { wake } = this.config;

    // Initialize global stores
    const storeScripts = this.root.querySelectorAll<HTMLScriptElement>(
      `script${selector('store')}`,
    );
    storeScripts.forEach((script) => {
      if (getApp(script) === this) {
        initStoreElement(script);
      }
    });

    // Attach scoped fetch handling event listeners to app root
    this._handleGlobalFetch = (e: Event) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(selector('fetch'));

      if (target) {
        if (getApp(target) !== this) return;

        const tune = getTuningStrategy(target);

        if (tune.trigger && tune.trigger.length > 0) {
          if (tune.trigger.includes(e.type)) {
            e.preventDefault();
            handleFetch(target);
          }
          return;
        }

        const tagName = target.tagName;
        const isForm = tagName === 'FORM';
        const isInput =
          tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';

        if (isForm && e.type === 'submit') {
          e.preventDefault();
          handleFetch(target);
          return;
        }

        if (isInput && (e.type === 'input' || e.type === 'change')) {
          handleFetch(target);
          return;
        }

        if (!isForm && !isInput && e.type === 'click') {
          e.preventDefault();
          handleFetch(target);
        }
      }
    };

    this._events.forEach((evt) => {
      this.root.addEventListener(evt, this._handleGlobalFetch!);
    });

    // Start the scoped mutation observer
    this._observer = initObserver(this);
    this._observer.observe(this.root, { childList: true, subtree: true });

    // Initial scan for controllers
    if (hasDirective(this.root, 'scope') && getApp(this.root) === this) {
      initControllerElement(this.root, wake);
    }

    const controllers = this.root.querySelectorAll<HTMLElement>(selector('scope'));
    controllers.forEach((el) => {
      if (getApp(el) === this) {
        initControllerElement(el, wake);
      }
    });

    // Initial scan for auto-fetching elements and custom triggers
    const fetchNodes = this.root.querySelectorAll<HTMLElement>(selector('fetch'));
    fetchNodes.forEach((el) => {
      if (getApp(el) !== this) return;

      const tune = getTuningStrategy(el);
      if (tune.trigger && tune.trigger.length > 0) {
        // Auto-start on 'load'
        if (tune.trigger.includes('load')) {
          handleFetch(el);
        }
        // Attach direct listeners for custom events
        tune.trigger.forEach((evt) => {
          if (evt !== 'load' && evt !== 'none' && !this._events.includes(evt)) {
            el.addEventListener(evt, (e) => {
              e.preventDefault();
              handleFetch(el);
            });
          }
        });
      }
    });

    requestAnimationFrame(() => {
      this.root.dispatchEvent(
        new CustomEvent('rz:app:ready', {
          bubbles: true,
          detail: { app: this },
        }),
      );
    });
  }

  /**
   * Completely tears down the app instance, unmounts controllers,
   * stops timers, and frees memory.
   */
  destroy() {
    if (!this._hasStarted) return;

    // Disconnect the mutation observer
    this._observer?.disconnect();

    // Remove global event listeners
    if (this._handleGlobalFetch) {
      this._events.forEach((evt) => {
        this.root.removeEventListener(evt, this._handleGlobalFetch!);
      });
    }

    // Unmount all controllers
    const controllers = this.root.querySelectorAll<HTMLElement>(selector('scope'));
    controllers.forEach(destroyInstance);
    if (hasDirective(this.root, 'scope')) {
      destroyInstance(this.root);
    }

    // Clear all active fetch polling timers
    const fetchNodes = this.root.querySelectorAll<HTMLElement>(selector('fetch'));
    fetchNodes.forEach(cleanupFetch);
    if (hasDirective(this.root, 'fetch')) {
      cleanupFetch(this.root);
    }

    // Cleanup store directive side-effects
    const storeScripts = this.root.querySelectorAll<HTMLScriptElement>(
      `script${selector('store')}`,
    );
    storeScripts.forEach(cleanupStoreElement);

    // Clear the EventBus
    this.bus.clear();

    // Remove the root indicator
    this.root.removeAttribute('data-rouse-app');
    this._hasStarted = false;

    this.root.dispatchEvent(
      new CustomEvent('rz:app:destroy', {
        bubbles: true,
        detail: { app: this },
      }),
    );
  }
}

/**
 * Finds the parent app instance for any child element.
 */
export function getApp(el: HTMLElement): RouseApp | undefined {
  const root = el.closest<HTMLElement>('[data-rouse-app]');
  if (!root) {
    console.warn('[Rouse] Element is not inside a Rouse app instance.', el);
    return undefined;
  }
  return appInstances.get(root);
}

/**
 * Main entry point for the framework.
 */
export function createApp(config: RouseConfig = {}): RouseApp {
  return new RouseApp(config);
}
