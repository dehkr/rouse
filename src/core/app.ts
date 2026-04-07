import { directiveSelector, err, hasDirective, warn } from '../core/shared';
import { rzTrigger } from '../directives';
import { destroyInstance } from '../dom/controller';
import {
  cleanupStoreElement,
  initControllerElement,
  initObserver,
  initStoreElement,
} from '../dom/initializer';
import { initDomMutator } from '../dom/mutator';
import { isAnchor, isForm, isInput, isSelect, isTextArea, on } from '../dom/utils';
import { cleanupFetch, handleFetch } from '../net/engine';
import { fallbackResponse } from '../net/response';
import type {
  FetchInterceptors,
  GlobalFetchConfig,
  RouseRequest,
  SetupFunction,
} from '../types';
import { Registry } from './registry';
import { StoreManager } from './store';
import { DEFAULT_TIMING, parseTime } from './timing';

export const defaultConfig = {
  timing: {
    debounceWait: DEFAULT_TIMING.DEBOUNCE,
    throttleWait: DEFAULT_TIMING.THROTTLE,
    autosaveWait: 1000,
  },
  network: {
    baseUrl: '',
    fetch: {} as GlobalFetchConfig,
    interceptors: {} as FetchInterceptors,
    refreshOnFocus: true,
    refreshOnReconnect: true,
  },
  ui: {
    loadingClass: 'rz-loading',
    wakeStrategy: 'load',
  },
};

export type RouseConfig = {
  root?: string | HTMLElement;
  timing?: Partial<typeof defaultConfig.timing>;
  network?: Partial<typeof defaultConfig.network>;
  ui?: Partial<typeof defaultConfig.ui>;
};

const appInstances = new WeakMap<HTMLElement, RouseApp>();
const fetchCleanups = new WeakMap<HTMLElement, Array<() => void>>();

const fail = (reason: string): never => {
  throw new Error(`[Rouse] Registration failed: ${reason}`);
};

export class RouseApp {
  public root: HTMLElement;
  public stores: StoreManager;
  public registry: Registry;
  public config: typeof defaultConfig;

  private _hasStarted = false;
  private _observer?: MutationObserver;
  private _abortController?: AbortController;

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

    // Merge defaults with user-provided config
    this.config = {
      timing: { ...defaultConfig.timing, ...config.timing },
      network: { ...defaultConfig.network, ...config.network },
      ui: { ...defaultConfig.ui, ...config.ui },
    };

    this.root = rootEl;
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
  register<P extends Record<string, any>>(name: string, setup: SetupFunction<P>): this;
  register(controllers: Record<string, SetupFunction<any>>): this;
  register(
    nameOrControllers: string | Record<string, SetupFunction<any>>,
    setup?: SetupFunction<any>,
  ): this {
    if (typeof nameOrControllers === 'string') {
      // Handle single registration
      if (typeof setup === 'function') {
        this.registry.register(nameOrControllers, setup);
      } else {
        fail(`A valid setup function is required for '${nameOrControllers}'.`);
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
          fail(`Controller '${name}' must be a setup function.`);
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
  async fetch(resource: string, options: RouseRequest = {}) {
    const targetRef = options.target || this.root;
    const el =
      typeof targetRef === 'string'
        ? document.querySelector<HTMLElement>(targetRef)
        : targetRef;

    if (!el) {
      err(`Fetch failed. Target element not found:`, targetRef);
      return fallbackResponse(options, 'Target element not found', 'INTERNAL_ERROR');
    }

    options.url = resource;

    return handleFetch(el, options);
  }

  /**
   * Starts the Rouse app instance. Sets up the global fetch handler.
   */
  start() {
    if (this._hasStarted) {
      warn(`'start()' called multiple times. Ignoring.`);
      return;
    }

    this._hasStarted = true;
    this._abortController = new AbortController();

    this.root.dispatchEvent(
      new CustomEvent('rz:app:start', {
        bubbles: true,
        detail: { app: this },
      }),
    );

    // Initialize the DOM mutator that watches for HTML fetch responses
    initDomMutator(this.root, this._abortController.signal);

    const { wakeStrategy } = this.config.ui;

    // Initialize global stores
    const storeScripts = this.root.querySelectorAll<HTMLScriptElement>(
      `script${directiveSelector('store')}`,
    );
    storeScripts.forEach((script) => {
      if (getApp(script) === this) {
        initStoreElement(script);
      }
    });

    // Start the scoped mutation observer
    this._observer = initObserver(this);
    this._observer.observe(this.root, { childList: true, subtree: true });

    // Initial scan for controllers
    if (hasDirective(this.root, 'scope') && getApp(this.root) === this) {
      initControllerElement(this.root, wakeStrategy);
    }

    const controllers = this.root.querySelectorAll<HTMLElement>(
      directiveSelector('scope'),
    );
    controllers.forEach((el) => {
      if (getApp(el) === this) {
        initControllerElement(el, wakeStrategy);
      }
    });

    // Initial scan for auto-fetching elements and custom triggers
    const fetchNodes = this.root.querySelectorAll<HTMLElement>(
      directiveSelector('fetch'),
    );
    fetchNodes.forEach((el) => {
      if (getApp(el) === this) {
        initFetchElement(el);
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
    this._abortController?.abort();

    // Unmount all controllers
    const controllers = this.root.querySelectorAll<HTMLElement>(
      directiveSelector('scope'),
    );
    controllers.forEach(destroyInstance);
    if (hasDirective(this.root, 'scope')) {
      destroyInstance(this.root);
    }

    // Clear all active fetch polling timers
    const fetchNodes = this.root.querySelectorAll<HTMLElement>(
      directiveSelector('fetch'),
    );
    fetchNodes.forEach(teardownFetchElement);
    if (hasDirective(this.root, 'fetch')) {
      teardownFetchElement(this.root);
    }

    // Cleanup store directive side-effects
    const storeScripts = this.root.querySelectorAll<HTMLScriptElement>(
      `script${directiveSelector('store')}`,
    );
    storeScripts.forEach(cleanupStoreElement);

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
 * Attaches synthetic events (like polling) and custom non-standard events
 * to an element and stores their cleanup functions.
 */
export function initFetchElement(el: HTMLElement) {
  if (fetchCleanups.has(el)) return;

  const isFormEl = isForm(el);
  const isAnchorEl = isAnchor(el);
  const isFieldEl = isInput(el) || isSelect(el) || isTextArea(el);

  let triggers = rzTrigger.handler(el);

  // Logical defaults if no `rz-trigger` directive exists
  if (triggers.length === 0) {
    const defaultEvent = isFormEl ? 'submit' : isFieldEl ? 'change' : 'click';
    triggers = [{ event: defaultEvent, modifiers: [] }];
  }

  const cleanups: Array<() => void> = [];

  triggers.forEach((trigger) => {
    if (trigger.event === 'load') {
      handleFetch(el);
    }

    // Handle synthetic poll event
    else if (trigger.event === 'poll') {
      const waitStr = trigger.modifiers[0];
      const ms = waitStr ? parseTime(waitStr) : 5000;
      if (ms > 0) {
        const timer = setInterval(() => {
          handleFetch(el);
        }, ms);
        cleanups.push(() => clearInterval(timer));
      }
    }

    // Attach event listeners
    else if (trigger.event !== 'none') {
      const removeListener = on(
        el,
        trigger.event,
        (e: Event) => {
          // Prevent defaults
          if ((isFormEl && e.type === 'submit') || (isAnchorEl && e.type === 'click')) {
            if (!trigger.modifiers.includes('prevent')) {
              e.preventDefault();
            }
          }
          handleFetch(el);
        },
        trigger.modifiers,
      );

      cleanups.push(removeListener);
    }
  });

  if (cleanups.length > 0) {
    fetchCleanups.set(el, cleanups);
  }
}

/**
 * Tears down pacing engines and synthetic polling intervals.
 */
export function teardownFetchElement(el: HTMLElement) {
  cleanupFetch(el);

  const cleanups = fetchCleanups.get(el);
  if (cleanups) {
    // Cleans up poll intervals/listeners
    cleanups.forEach((fn) => {
      fn();
    });
    fetchCleanups.delete(el);
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
