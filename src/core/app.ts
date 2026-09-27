import {
  rzAttr,
  rzClass,
  rzFetch,
  rzHtml,
  rzModel,
  rzOn,
  rzProp,
  rzPull,
  rzPush,
  rzRender,
  rzSse,
  rzStore,
  rzStyle,
  rzText,
} from '../directives';
import { SCOPE_SELECTOR } from '../directives/rz-scope';
import {
  mountGlobalBinding,
  registerBoundDirectives,
  teardownGlobalBindings,
  walkBoundElements,
  warnIfMounting,
} from '../dom/binder';
import { initDomRouter, placeContent } from '../dom/dom-router';
import { createBoundOn } from '../dom/events';
import { initObserver } from '../dom/observer';
import { destroyInstance, IS_SCOPE, initScopeElement } from '../dom/scope';
import { initStoreRouter } from '../dom/store-router';
import { runFetch } from '../net/fetch-engine';
import { openBoundStream } from '../net/sse-engine';
import type {
  BoundOn,
  ErrorInterceptor,
  FetchRequest,
  InterceptorPhase,
  PlaceOptions,
  RequestInterceptor,
  ResponseInterceptor,
  RouseFetch,
  RouseSse,
  ScopeSetup,
  VoidFn,
} from '../types';
import { queryTargets } from './attributes';
import { fail, info, warn } from './diagnostics';
import { dispatch } from './dispatch';
import { ScopeRegistry } from './scope-registry';
import { StoreManager, type SyncPolicy } from './store';

export interface RouseConfig {
  /** Element or selector where the app mounts. Defaults to `document.body`. */
  root?: string | HTMLElement;
  /** Prepended to relative URLs in `rz-fetch`, `rz-push`, `rz-pull`, and `{app,ctx}.fetch()`. */
  baseUrl?: string;
  /** Default headers applied to every request. Merged with per-request and directive-level headers; a `null` value removes the header. */
  headers?: Record<string, string | null>;
  /** Standard fetch `credentials` value applied to every request. */
  credentials?: RequestCredentials;
  /** Abort every request after this many milliseconds. A per-request `timeout` overrides it; `0` (the default) means no deadline. */
  timeout?: number;
  /** Default scope activation strategy. Overridden by `rz-wake`. */
  wake?: string;
}

interface ResolvedConfig {
  root: HTMLElement;
  baseUrl: string;
  headers: Record<string, string | null>;
  // Left undefined when not configured; fetch()'s native default is 'same-origin'.
  credentials?: RequestCredentials;
  timeout: number;
  wake: string;
}

export const NETWORK_DIRECTIVES = [rzFetch, rzPush, rzPull, rzSse];
const appInstances = new WeakMap<HTMLElement, RouseApp>();

let bannerLogged = false;

/** One-time dev-build notice. Message and latch are both stripped from the min build. */
function logBuildBanner() {
  if (bannerLogged) return;
  bannerLogged = true;
  info(`v${__VERSION__} development build. Switch to rouse.min.js in production.`);
}

registerBoundDirectives(
  rzAttr,
  rzClass,
  rzHtml,
  rzModel,
  rzOn,
  rzProp,
  rzRender,
  rzStyle,
  rzText,
);

/**
 * A Rouse application instance. Holds the root element, the stores, the
 * registered scopes, the network interceptors, and the `fetch` and `on` helpers.
 *
 * Creating an app touches the DOM only to claim the root; no directives are read
 * until `start()`, so stores and scopes can be registered in any order first.
 * A root hosts one app at a time, and the constructor throws rather than attach
 * a second.
 *
 * @example
 * const app = rouse({ root: '#app', baseUrl: '/api' });
 * app.store('cart', { items: [] });
 * app.scope('counter', counter);
 * app.start();
 */
export class RouseApp {
  public readonly root: HTMLElement;
  public readonly config: Readonly<ResolvedConfig>;
  public stores: StoreManager;
  public registry: ScopeRegistry;
  public isReady: boolean;

  /**
   * Makes a network request using the app's configuration. Registered interceptors,
   * default headers, and credentials all apply, and a relative URL is resolved against
   * the configured `baseUrl`.
   *
   * @example
   * const { data, error } = await app.fetch('/api/user');
   */
  public fetch: RouseFetch;

  /**
   * Opens a server-sent events stream, or joins one already open at the same URL.
   *
   * @example
   * const close = app.sse('/api/feed');
   * app.on('rz:sse:message:html', (e) => app.place(feedEl, e.detail.data, { position: 'beforeend' }));
   */
  public sse: RouseSse;

  /**
   * Adds an event listener that is auto-removed when the app is destroyed. Listens
   * on `app.root` unless an `EventTarget` is passed first.
   *
   * @returns A teardown closure that removes the listener early.
   *
   * @example
   * app.on('click', onClick, { debounce: 300 });
   * app.on(window, ['online', 'offline'], sync);
   */
  public on: BoundOn;

  /** @internal */
  public _interceptors: {
    request: Set<RequestInterceptor>;
    response: Set<ResponseInterceptor>;
    error: Set<ErrorInterceptor>;
  };

  private _hasStarted = false;
  private _destroyed = false;
  private _observer?: MutationObserver;
  private _abortController: AbortController;

  /**
   * Resolves the root, marks it with `data-rouse-app`, and wires the stores, scopes,
   * interceptors, and app-lifetime `AbortController`.
   *
   * @throws If the root cannot be found, or already has an app attached.
   */
  constructor(config: RouseConfig = {}) {
    __DEV__ && logBuildBanner();

    const rootEl =
      typeof config.root === 'string'
        ? (document.querySelector(config.root) as HTMLElement)
        : (config.root ?? document.body);

    if (!rootEl) {
      fail('Root element not found.');
    }

    if (appInstances.has(rootEl)) {
      fail('An app instance is already attached to this element.');
    }

    this.root = rootEl;

    this.config = {
      root: rootEl,
      baseUrl: config.baseUrl ?? '',
      headers: config.headers ?? {},
      credentials: config.credentials,
      timeout: config.timeout ?? 0,
      wake: config.wake?.trim() || 'ready',
    };

    this._interceptors = {
      request: new Set(),
      response: new Set(),
      error: new Set(),
    };

    this.stores = new StoreManager(this);
    this.registry = new ScopeRegistry();
    this.isReady = false;

    // Mark root so children can find parent app
    this.root.setAttribute('data-rouse-app', '');
    appInstances.set(this.root, this);

    // Bound so `app.fetch(url)` resolves to this instance
    this.fetch = this._fetch.bind(this);

    // App-lifetime signal, created here instead of in `start` so `app.on` can bind
    // before `app.start()` is called. Is aborted in `destroy`.
    this._abortController = new AbortController();

    // A lifecycle-safe listener bound to the app-lifetime signal, auto-removed on `destroy`
    this.on = createBoundOn(
      this.root,
      this._abortController.signal,
      this,
      __DEV__ ? (options) => warnIfMounting('on', options.signal != null) : undefined,
    );

    // Released when the app-lifetime signal aborts, like `app.on` listeners
    this.sse = (resource, options = {}) => {
      __DEV__ && warnIfMounting('sse');
      return openBoundStream(this, resource, options, this._abortController.signal);
    };
  }

  /**
   * Registers a scope setup function by name. `data-rz-scope="counter"` resolves
   * against the names registered here.
   *
   * Elements are wired as they are scanned, and a name that is not registered before
   * `start()` is skipped with a warning rather than picked up once it arrives.
   *
   * @param name - Unique name. Referenced by `rz-scope`.
   * @param setup - The setup function.
   * @returns The app, so calls can be chained.
   * @throws If the setup is not a function.
   *
   * @example
   * app.scope('counter', ({ host, app }) => { ... });
   */
  scope<E extends Element = HTMLElement>(name: string, setup: ScopeSetup<E>): this {
    if (typeof setup !== 'function') {
      fail(`Scope '${name}' must be a setup function.`);
    }

    __DEV__ && warnIfMounting('scope');

    // Brand as validated; registry.register rejects unbranded setups
    (setup as any)[IS_SCOPE] = true;
    this.registry.register(name, setup);

    return this;
  }

  /**
   * Creates a reactive store and returns its data proxy.
   *
   * A store is one flat object. Data, getters, and methods live side by side.
   * Getters are cached as computeds bound to the proxy and must stay pure. Work
   * that needs cleanup belongs in a scope instead.
   *
   * Only plain, JSON-serializable data is synced. Methods and getters are untouched
   * by snapshots, push bodies, `reset()`, and incoming server state.
   *
   * @template T - Shape of the store's data, getters, and methods.
   * @param name - Unique name. Referenced as `@name` in directives.
   * @param data - Initial state. Made reactive, and kept as the snapshot `reset()` restores.
   * @param config - Standing sync config: the endpoint URL, headers, and other transport options.
   * @returns The store's reactive proxy.
   * @throws If a store of this name already exists.
   *
   * @example
   * const cart = app.store('cart', {
   *   items: [],
   *   get total() {
   *     return this.items.reduce((sum, item) => sum + item.price, 0);
   *   },
   *   clear() {
   *     this.items = [];
   *   },
   * }, { url: '/api/cart' });
   *
   * cart.items.push(item);
   */
  store<T extends object>(name: string, data: T, config?: Partial<SyncPolicy>) {
    return this.stores.create<T>(name, data, config);
  }

  /**
   * Places an HTML string into the page, the programmatic counterpart to `rz-place`.
   * A selector is matched within the app root, including the root itself, and every
   * match receives the content.
   *
   * The position defaults to `innerHTML`. `outerHTML` replaces the target, `delete`
   * removes it (pass `''` as the content), and positions such as `beforeend` insert
   * next to or inside it. Each placement fires `rz:dom:place:before`, which can
   * cancel it or change the content, and then `rz:dom:place`. Those events reach
   * `app.on` listeners only when the target is inside the app root.
   *
   * @returns `true` if the content was placed into at least one element, `false` if nothing matched or every placement was canceled.
   *
   * @example
   * app.place('#feed', html, { position: 'beforeend' });
   * app.place(el, html);
   * app.place('#item-4', '', { position: 'delete' });
   */
  place(target: Element | string, content: string, options?: PlaceOptions): boolean {
    return placeContent(this, target, content, options);
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
   * remove();
   *
   * // Inside a scope, use ctx.interceptor() so it's removed with the scope.
   */
  interceptor(phase: 'request', fn: RequestInterceptor): VoidFn;
  interceptor(phase: 'response', fn: ResponseInterceptor): VoidFn;
  interceptor(phase: 'error', fn: ErrorInterceptor): VoidFn;
  interceptor(phase: InterceptorPhase, fn: any): VoidFn {
    __DEV__ && warnIfMounting('interceptor');
    return this._addInterceptor(phase, fn);
  }

  /**
   * Registers an interceptor without the scope-mount check, removed when `signal` aborts.
   * Backs `app.interceptor` and `ctx.interceptor`.
   * @internal
   */
  _addInterceptor(phase: InterceptorPhase, fn: any, signal?: AbortSignal): VoidFn {
    const set = this._interceptors[phase];
    if (!set) {
      fail(
        `Invalid interceptor: '${phase}'. Expected 'request', 'response', or 'error'.`,
      );
    }
    if (typeof fn !== 'function') {
      fail(`Interceptor for '${phase}' must be a function.`);
    }

    if (!signal) {
      set.add(fn);
      return () => set.delete(fn);
    }

    // An aborted signal never fires `abort` again, so registering would leak
    if (signal.aborted) {
      return () => {};
    }

    // Interceptors are stored in a Set, so two scopes registering the same function
    // would share one entry, and the first teardown would remove it for both. A
    // wrapper per call gives each registration its own entry.
    const entry = (...args: any[]) => fn(...args);
    const remove = () => set.delete(entry);
    set.add(entry);
    signal.addEventListener('abort', remove, { once: true });

    return () => {
      signal.removeEventListener('abort', remove);
      remove();
    };
  }

  /**
   * Triggers a Rouse network request. `options.triggerEl` marks an originating
   * element; without one nothing is read from the DOM and the `rz:fetch:*`
   * events fire from the app root.
   */
  private async _fetch(url: string, options: FetchRequest = {}) {
    return runFetch(this, { ...options, url });
  }

  /**
   * Brings the app to life: reads the markup under `root`, creates stores, mounts
   * scopes, binds directives, and starts watching for elements added later.
   *
   * Fires `rz:app:start` before reading anything, and `rz:app:ready` on the next
   * animation frame, once the initial bindings have run and `isReady` is true.
   * Calling it a second time, or after `destroy()`, warns and does nothing.
   *
   * @example
   * document.addEventListener('DOMContentLoaded', () => app.start());
   */
  start() {
    if (this._destroyed) {
      __DEV__ &&
        warn(
          `'start()' called on a destroyed app. Ignoring. Create a new instance instead.`,
        );
      return;
    }
    if (this._hasStarted) {
      __DEV__ && warn(`'start()' called multiple times. Ignoring.`);
      return;
    }

    this._hasStarted = true;

    dispatch(this.root, 'rz:app:start', { app: this });

    initDomRouter(this, this._abortController.signal);
    initStoreRouter(this, this._abortController.signal);

    // Scan for store <script> elements first to ensure state exists for bindings
    const storeScriptEls = queryTargets<HTMLScriptElement>(this.root, rzStore.selector);
    for (const el of storeScriptEls) {
      if (getApp(el, this)) {
        rzStore.initialize(el, this);
      }
    }

    this._observer = initObserver(this);
    this._observer.observe(this.root, { childList: true, subtree: true });

    const scopeEls = queryTargets<HTMLElement>(this.root, SCOPE_SELECTOR);
    for (const el of scopeEls) {
      if (getApp(el, this)) {
        initScopeElement(el, this);
      }
    }

    for (const directive of NETWORK_DIRECTIVES) {
      const networkEls = queryTargets(this.root, directive.selector);
      for (const el of networkEls) {
        if (getApp(el, this)) {
          directive.initialize(el, this);
        }
      }
    }

    if (!this.root.closest(SCOPE_SELECTOR)) {
      walkBoundElements(this.root, (el) => {
        if (!getApp(el, this)) return;
        mountGlobalBinding(el, this);
      });
    }

    requestAnimationFrame(() => {
      if (this._destroyed) return;
      this.isReady = true;
      dispatch(this.root, 'rz:app:ready', { app: this });
    });
  }

  /**
   * Shuts the app down: stops watching the DOM, unmounts every scope, unbinds
   * every directive, then fires `rz:app:destroy` and aborts the app's signal.
   *
   * This is final. Aborting drops `app.on` listeners and any request still in
   * flight, and `start()` will not run again. Does nothing if the app never
   * started or is already gone.
   */
  destroy() {
    if (!this._hasStarted || this._destroyed) return;
    this._destroyed = true;

    this._observer?.disconnect();

    const scopeEls = queryTargets<HTMLElement>(this.root, SCOPE_SELECTOR);
    scopeEls.forEach(destroyInstance);

    for (const directive of NETWORK_DIRECTIVES) {
      const networkEls = queryTargets(this.root, directive.selector);
      networkEls.forEach((el) => directive.teardown(el));
    }

    for (const el of this.stores.elements()) {
      rzStore.teardown(el as HTMLScriptElement);
    }

    teardownGlobalBindings(this.root);

    dispatch(this.root, 'rz:app:destroy', { app: this });

    // Release after the destroy event so app.on('rz:app:destroy') fires and
    // getApp(e.target) still resolves.
    this.root.removeAttribute('data-rouse-app');
    appInstances.delete(this.root);
    this._abortController.abort();
  }
}

/**
 * Returns the app owning `el`, found through its nearest app root. With `expected`,
 * returns `undefined` when the owner is a different app, which keeps scan sites out
 * of nested apps.
 */
export function getApp(el: Element, expected?: RouseApp): RouseApp | undefined {
  const root = el.closest<HTMLElement>('[data-rouse-app]');
  if (!root) {
    __DEV__ && warn('Element is not inside an app instance.', el);
    return undefined;
  }

  const found = appInstances.get(root);
  if (expected && found !== expected) {
    __DEV__ && warn('Element does not belong to the expected app instance.', el);
    return undefined;
  }

  return found;
}

/**
 * Creates a Rouse app instance. The standard entry point; equivalent
 * to `new RouseApp(config)`.
 *
 * @param config - App-wide configuration, fixed once the app exists.
 * @returns A new app, ready for stores and scopes and waiting on `start()`.
 *
 * @example
 * const app = rouse({ root: '#app' });
 * app.scope('counter', counter);
 * app.start();
 */
export function rouse(config: RouseConfig = {}): RouseApp {
  return new RouseApp(config);
}
