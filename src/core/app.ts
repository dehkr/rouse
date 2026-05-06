import { directiveSelector, err, queryTargets, warn } from '../core/shared';
import { rzFetch, rzStore } from '../directives';
import { controller, destroyInstance, IS_CONTROLLER } from '../dom/controller';
import { initControllerElement, initObserver } from '../dom/initializer';
import { initDomMutator } from '../dom/mutator';
import { initStoreRouter } from '../dom/router';
import { initFormValidationEngine } from '../dom/validation';
import { handleFetch } from '../net/engine';
import { fallbackResponse } from '../net/response';
import type {
  ControllerFunction,
  FetchInterceptors,
  GlobalFetchConfig,
  RouseRequest,
} from '../types';
import { Registry } from './registry';
import { deepFreeze } from './shared';
import { StoreManager } from './store';
import { DEFAULT_DEBOUNCE_MS, DEFAULT_THROTTLE_MS } from './timing';

export const defaultConfig = {
  root: document.body,
  timing: {
    debounceWait: DEFAULT_DEBOUNCE_MS,
    throttleWait: DEFAULT_THROTTLE_MS,
  },
  network: {
    baseUrl: '',
    fetch: {} as GlobalFetchConfig,
    interceptors: {} as FetchInterceptors,
  },
  ui: {
    errorClass: 'rz-error',
    loadingClass: 'rz-loading',
    wakeStrategy: 'ready',
  },
};

export type RouseConfig = {
  root?: string | HTMLElement;
  timing?: Partial<typeof defaultConfig.timing>;
  network?: Partial<typeof defaultConfig.network>;
  ui?: Partial<typeof defaultConfig.ui>;
};

const appInstances = new WeakMap<HTMLElement, RouseApp>();

/**
 * Core class for instantiating Rouse app instances.
 */
export class RouseApp {
  public root: HTMLElement;
  public stores: StoreManager;
  public registry: Registry;
  public config: typeof defaultConfig;
  public isReady: Boolean;

  private _hasStarted = false;
  private _observer?: MutationObserver;
  private _abortController?: AbortController;

  constructor(config: RouseConfig = {}) {
    const rootEl =
      typeof config.root === 'string'
        ? (document.querySelector(config.root) as HTMLElement)
        : (config.root ?? defaultConfig.root);

    if (!rootEl) {
      throw new Error('[Rouse] Root element not found.');
    }

    // Only one instance per element allowed
    if (appInstances.has(rootEl)) {
      throw new Error('[Rouse] An app instance is already attached to this element.');
    }

    // Merge defaults with user-provided config
    this.config = {
      root: rootEl,
      timing: {
        ...defaultConfig.timing,
        ...config.timing,
      },
      ui: {
        ...defaultConfig.ui,
        ...config.ui,
      },
      network: {
        ...defaultConfig.network,
        ...config.network,
        fetch: {
          ...defaultConfig.network.fetch,
          ...config.network?.fetch,
        },
        interceptors: {
          ...defaultConfig.network.interceptors,
          ...config.network?.interceptors,
        },
      },
    };

    this.root = rootEl;
    this.stores = new StoreManager(this.config);
    this.registry = new Registry();
    this.isReady = false;

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
  register<P extends Record<string, any>>(
    name: string,
    setup: ControllerFunction<P>,
  ): this;
  register(controllers: Record<string, ControllerFunction<any>>): this;
  register(
    nameOrControllers: string | Record<string, ControllerFunction<any>>,
    setup?: ControllerFunction<any>,
  ): this {
    const map =
      typeof nameOrControllers === 'string'
        ? { [nameOrControllers]: setup }
        : nameOrControllers;

    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      throw new Error('[Rouse] Invalid controller registration.');
    }

    for (const [name, fn] of Object.entries(map)) {
      if (typeof fn !== 'function') {
        throw new Error(`[Rouse] Controller '${name}' must be a setup function.`);
      }

      // Auto-wrap functions with `controller()` if they weren't already
      const finalSetup = (fn as any)[IS_CONTROLLER] ? fn : controller(fn);
      this.registry.register(name, finalSetup);
    }

    return this;
  }

  /**
   * Creates a new reactive store.
   */
  createStore(name: string, state: object, config?: any) {
    return this.stores.create(name, state, config);
  }

  /**
   * Trigger a Rouse network request.
   *
   * @param resource - The URL to fetch.
   * @param options - Network configuration, including the DOM `target`.
   */
  async fetch(resource: string, options: RouseRequest = {}) {
    const targetRef = options.target || this.root;
    let el: Element | null = null;

    if (typeof targetRef === 'string') {
      try {
        el = document.querySelector<HTMLElement>(targetRef);
      } catch {
        // Fails gracefully on invalid selector
      }
    } else {
      el = targetRef;
    }

    if (!el) {
      err(`Fetch failed. Target element not found:`, targetRef);
      return fallbackResponse(options, 'Target element not found', 'INTERNAL_ERROR');
    }

    options.url = resource;
    return handleFetch(el, this, options);
  }

  /**
   * Starts the Rouse app instance. Sets up the global fetch handler.
   */
  start() {
    if (this._hasStarted) {
      warn(`'start()' called multiple times. Ignoring.`);
      return;
    }

    // Lock the configuration for this app instance
    deepFreeze(this.config);

    this._hasStarted = true;
    this._abortController = new AbortController();

    this.root.dispatchEvent(
      new CustomEvent('rz:app:start', {
        bubbles: true,
        detail: { app: this },
      }),
    );

    // Watch for HTML fetch responses
    initDomMutator(this.root, this._abortController.signal);

    // Watch for JSON fetch responses
    initStoreRouter(this, this._abortController.signal);

    // Manage granular JSON error states
    initFormValidationEngine(this, this._abortController.signal);

    // Scan for store <script> elements to ensure state exists first
    const storeScriptElements = queryTargets(
      this.root,
      `script${directiveSelector('store')}`,
    );
    storeScriptElements.forEach((el) => {
      if (rzStore.validate(el, this)) {
        rzStore.initialize(el, this);
      }
    });

    // Start the scoped mutation observer
    this._observer = initObserver(this);
    this._observer.observe(this.root, { childList: true, subtree: true });

    // Initial scan for controllers
    const controllers = queryTargets<HTMLElement>(this.root, directiveSelector('scope'));
    controllers.forEach((el) => {
      if (getApp(el) === this) {
        initControllerElement(el, this);
      }
    });

    // Initial scan for fetch elements
    const fetchNodes = queryTargets(this.root, directiveSelector('fetch'));
    fetchNodes.forEach((el) => {
      if (getApp(el) === this) {
        rzFetch.initialize(el, this);
      }
    });

    requestAnimationFrame(() => {
      this.isReady = true;
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
    this._abortController?.abort();

    // Unmount all controllers
    const controllers = queryTargets<HTMLElement>(this.root, directiveSelector('scope'));
    controllers.forEach(destroyInstance);

    // Clear all active fetch polling timers
    const fetchNodes = queryTargets<HTMLElement>(this.root, directiveSelector('fetch'));
    fetchNodes.forEach(rzFetch.teardown);

    // Cleanup store directive side-effects
    const storeScriptElements = queryTargets<HTMLScriptElement>(
      this.root,
      `script${directiveSelector('store')}`,
    );
    storeScriptElements.forEach(rzStore.teardown);

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
export function getApp(el: Element): RouseApp | undefined {
  const root = el.closest<HTMLElement>('[data-rouse-app]');
  if (!root) {
    warn('Element is not inside a Rouse app instance:', el);
    return undefined;
  }
  return appInstances.get(root);
}

/**
 * Main entry point for the framework.
 */
export function rouse(config: RouseConfig = {}): RouseApp {
  return new RouseApp(config);
}
