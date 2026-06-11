import { directiveSelector, err, queryTargets, warn } from '../core/shared';
import { rzFetch, rzRefresh, rzSave, rzStore } from '../directives';
import {
  mountGlobalBinding,
  teardownGlobalBindings,
  walkBoundElements,
} from '../dom/attacher';
import { defineController, destroyInstance, IS_CONTROLLER } from '../dom/controller';
import { initControllerElement, initObserver } from '../dom/initializer';
import { initDomMutator } from '../dom/mutator';
import { initStoreRouter } from '../dom/router';
import { initFormValidationEngine } from '../dom/validation';
import { handleFetch } from '../net/engine';
import { fallbackResponse } from '../net/response';
import type {
  ControllerFn,
  ErrorInterceptor,
  InterceptorPhase,
  RequestInterceptor,
  ResponseInterceptor,
  RouseRequest,
  VoidFn,
} from '../types';
import { Registry } from './registry';
import { StoreManager } from './store';

export interface RouseConfig {
  /** Element or selector where the app mounts. Defaults to `document.body`. */
  root?: string | HTMLElement;
  /** Prepended to relative URLs in `rz-fetch`, `rz-save`, `rz-refresh`, and `app.fetch()`. */
  baseUrl?: string;
  /** Default headers applied to every request. Merged with per-request and directive-level headers. */
  headers?: Record<string, string>;
  /** Standard fetch `credentials` value applied to every request. */
  credentials?: RequestCredentials;
  /** Default controller activation strategy. Overridden by `rz-wake`. */
  wake?: string;
}

interface ResolvedConfig {
  root: HTMLElement;
  baseUrl: string;
  headers: Record<string, string>;
  // Left undefined when not configured; fetch()'s native default is 'same-origin'.
  credentials?: RequestCredentials;
  wake: string;
}

const appInstances = new WeakMap<HTMLElement, RouseApp>();

/**
 * Core class for instantiating Rouse app instances.
 */
export class RouseApp {
  public readonly root: HTMLElement;
  public readonly config: Readonly<ResolvedConfig>;
  public stores: StoreManager;
  public registry: Registry;
  public isReady: boolean;
  public _interceptors: {
    request: Set<RequestInterceptor>;
    response: Set<ResponseInterceptor>;
    error: Set<ErrorInterceptor>;
  };

  private _hasStarted = false;
  private _observer?: MutationObserver;
  private _abortController?: AbortController;

  constructor(config: RouseConfig = {}) {
    const rootEl =
      typeof config.root === 'string'
        ? (document.querySelector(config.root) as HTMLElement)
        : (config.root ?? document.body);

    if (!rootEl) {
      throw new Error('[Rouse] Root element not found.');
    }

    if (appInstances.has(rootEl)) {
      throw new Error('[Rouse] An app instance is already attached to this element.');
    }

    this.root = rootEl;

    this.config = {
      root: rootEl,
      baseUrl: config.baseUrl ?? '',
      headers: config.headers ?? {},
      credentials: config.credentials,
      wake: config.wake?.trim() || 'ready',
    };

    this._interceptors = {
      request: new Set(),
      response: new Set(),
      error: new Set(),
    };

    this.stores = new StoreManager(this);
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
   * app.controller('counter', counter);
   * app.controller('cart', cart);
   *
   * @example
   * // Object shorthand for bulk registration
   * app.controller({ counter, cart });
   *
   * @param nameOrControllers - Either the unique string name of a controller, or an object mapping names to setup functions.
   * @param setup - The setup function (only required when the first argument is a string).
   */
  controller<P extends Record<string, any>>(name: string, setup: ControllerFn<P>): this;
  controller(controllers: Record<string, ControllerFn<any>>): this;
  controller(
    nameOrControllers: string | Record<string, ControllerFn<any>>,
    setup?: ControllerFn<any>,
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
      const finalSetup = (fn as any)[IS_CONTROLLER] ? fn : defineController(fn);
      this.registry.register(name, finalSetup);
    }

    return this;
  }

  /**
   * Creates a new reactive store.
   */
  store<T extends object>(name: string, state: T, config?: any) {
    return this.stores.create<T>(name, state, config);
  }

  /**
   * Registers a network interceptor. Interceptors run in FIFO order and are
   * `await`ed sequentially, so async interceptors block subsequent ones in
   * the same phase.
   *
   * @returns A teardown closure that unregisters the interceptor.
   *
   * @example
   * const remove = app.interceptor('request', (config) => {
   *   config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
   *   return config;
   * });
   *
   * // Later, e.g. in a controller's disconnect():
   * remove();
   */
  interceptor(phase: 'request', fn: RequestInterceptor): VoidFn;
  interceptor(phase: 'response', fn: ResponseInterceptor): VoidFn;
  interceptor(phase: 'error', fn: ErrorInterceptor): VoidFn;
  interceptor(phase: InterceptorPhase, fn: any): VoidFn {
    const set = this._interceptors[phase];
    if (!set) {
      throw new Error(
        `[Rouse] Invalid interceptor: '${phase}'. Expected 'request', 'response', or 'error'.`,
      );
    }
    set.add(fn);
    return () => set.delete(fn);
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

    // Initial scans

    const controllers = queryTargets<HTMLElement>(this.root, directiveSelector('scope'));
    controllers.forEach((el) => {
      if (getApp(el, this)) {
        initControllerElement(el, this);
      }
    });

    const fetchNodes = queryTargets(this.root, directiveSelector('fetch'));
    fetchNodes.forEach((el) => {
      if (getApp(el, this)) {
        rzFetch.initialize(el, this);
      }
    });

    const saveNodes = queryTargets(this.root, directiveSelector('save'));
    saveNodes.forEach((el) => {
      if (getApp(el, this)) {
        rzSave.initialize(el, this);
      }
    });

    const refreshNodes = queryTargets(this.root, directiveSelector('refresh'));
    refreshNodes.forEach((el) => {
      if (getApp(el, this)) {
        rzRefresh.initialize(el, this);
      }
    });

    if (!this.root.closest(directiveSelector('scope'))) {
      walkBoundElements(this.root, (el) => {
        if (!getApp(el, this)) return;
        mountGlobalBinding(el, this);
      });
    }

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

    // Cleanup network directives
    for (const d of [rzFetch, rzSave, rzRefresh]) {
      queryTargets(this.root, directiveSelector(d.slug)).forEach(d.teardown);
    }

    // Cleanup store directive side-effects
    for (const el of this.stores.elements()) {
      rzStore.teardown(el as HTMLScriptElement);
    }

    // Cleanup global bindings
    teardownGlobalBindings(this.root);

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
export function getApp(el: Element, expected?: RouseApp): RouseApp | undefined {
  const root = el.closest<HTMLElement>('[data-rouse-app]');
  if (!root) {
    warn('Element is not inside an app instance:', el);
    return undefined;
  }

  const found = appInstances.get(root);
  if (expected && found !== expected) {
    warn('Element does not belong to the expected app instance:', el);
    return undefined;
  }

  return found;
}

/**
 * Main entry point for the framework.
 */
export function rouse(config: RouseConfig = {}): RouseApp {
  return new RouseApp(config);
}
