import type { RouseApp } from './core/app';
import type { InsertMethod, PatchAction } from './core/constants';
import type { StoreManager } from './core/store';

export type DirectiveSlug =
  | 'attr'
  | 'error'
  | 'fetch'
  | 'fetch-headers'
  | 'fetch-request'
  | 'headers'
  | 'html'
  | 'model'
  | 'on'
  | 'refresh'
  | 'refresh-headers'
  | 'refresh-request'
  | 'request'
  | 'save'
  | 'save-headers'
  | 'save-request'
  | 'scope'
  | 'store'
  | 'target'
  | 'text'
  | 'url'
  | 'validate'
  | 'wake';

export interface AppEventDetail {
  app: RouseApp;
}

/** `rz:controller:init` — fires after the setup function runs, before bindings attach. */
export interface ControllerInitDetail {
  context: ControllerCtx;
  instance: Controller;
}

/** `rz:controller:connect` / `rz:controller:disconnect` — bindings attach / detach. */
export interface ControllerLifecycleDetail {
  instance: Controller;
}

/** `rz:fetch:config` — pre-flight; cancelable. Listeners can mutate `config`. */
export interface FetchConfigDetail {
  config: RouseRequest;
  url: string;
  method: string;
}

/** `rz:fetch:start`, `rz:fetch:abort`, `rz:fetch:end` — config-only fetch lifecycle. */
export interface FetchLifecycleDetail {
  config: RouseRequest;
}

/** `rz:fetch:error` — normalized error plus the request config. */
export interface FetchErrorDetail {
  error: RequestError | Error;
  config: RouseRequest;
}

/** `rz:fetch:success` and the typed `:json` / `:html` / `:file` sub-events. */
export type FetchSuccessDetail = RouseResponse;
export type FetchSuccessJsonDetail = RouseResponse<Record<string, any> | any[]>;
export type FetchSuccessHtmlDetail = RouseResponse<string>;
export type FetchSuccessFileDetail = RouseResponse<Blob | ArrayBuffer>;

/** `rz:fetch:error:json` / `:html` / `:file` — error responses with a routable body. */
export type FetchErrorJsonDetail = RouseResponse<Record<string, any> | any[]>;
export type FetchErrorHtmlDetail = RouseResponse<string>;
export type FetchErrorFileDetail = RouseResponse<Blob | ArrayBuffer>;

export interface BaseStoreSync {
  storeName: string;
  operation: 'save' | 'refresh';
  nestedPath?: string;
  action?: PatchAction;
}

export interface StoreSyncDetail extends BaseStoreSync {
  data: any;
  response?: RouseResponse;
  payload?: any;
}

/** Fires before the local store is patched from server data. */
export interface StoreSyncBeforeDetail extends BaseStoreSync {
  data: any;
  payload?: any;
}

export interface StoreSyncConflictDetail extends BaseStoreSync {
  localData: any;
  serverData: any;
  response: RouseResponse;
  reason: 'mutating';
}

export interface StoreSyncErrorDetail extends BaseStoreSync {
  data: any;
  error: any;
}

export interface StoreSyncRollbackDetail extends BaseStoreSync {
  data: any;
  rolledBackTo: any;
  error: unknown;
  reason: 'save-error';
}

export interface DomUpdateDetail {
  target: Element;
  strategy: InsertMethod;
  payload: string;
  source: 'fetch' | 'programmatic';
}

/** Maps every lifecycle event name to the shape of `event.detail`. */
export interface LifecycleEventMap {
  'rz:app:start': AppEventDetail;
  'rz:app:ready': AppEventDetail;
  'rz:app:destroy': AppEventDetail;

  'rz:controller:init': ControllerInitDetail;
  'rz:controller:connect': ControllerLifecycleDetail;
  'rz:controller:disconnect': ControllerLifecycleDetail;
  'rz:controller:destroy': undefined;

  'rz:fetch:config': FetchConfigDetail;
  'rz:fetch:start': FetchLifecycleDetail;
  'rz:fetch:abort': FetchLifecycleDetail;
  'rz:fetch:end': FetchLifecycleDetail;
  'rz:fetch:success': FetchSuccessDetail;
  'rz:fetch:success:json': FetchSuccessJsonDetail;
  'rz:fetch:success:html': FetchSuccessHtmlDetail;
  'rz:fetch:success:file': FetchSuccessFileDetail;
  'rz:fetch:error': FetchErrorDetail;
  'rz:fetch:error:json': FetchErrorJsonDetail;
  'rz:fetch:error:html': FetchErrorHtmlDetail;
  'rz:fetch:error:file': FetchErrorFileDetail;

  'rz:store:sync:before': StoreSyncBeforeDetail;
  'rz:store:sync': StoreSyncDetail;
  'rz:store:sync:conflict': StoreSyncConflictDetail;
  'rz:store:sync:error': StoreSyncErrorDetail;
  'rz:store:sync:rollback': StoreSyncRollbackDetail;

  'rz:dom:update:before': DomUpdateDetail;
  'rz:dom:update': DomUpdateDetail;
}

export type LifecycleEvent = keyof LifecycleEventMap;

export type BindableValue =
  | string
  | string[]
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean> // For class bindings
  | Record<string, string>; // For style bindings

export type AnyFunction = (...args: any[]) => any;
export type VoidFn = () => void;
export type ActionFn = (e?: Event) => void;

declare const CLEANUP: unique symbol;
export type BoundCleanupFn = VoidFn & { [CLEANUP]: true };

/**
 * The object returned by a setup function.
 * Includes standard lifecycle hooks and any custom state/methods.
 */
export type Controller = Record<string, any> & {
  connect?: () => void;
  disconnect?: () => void;
};

/** Parsed trigger event with modifiers */
export type TriggerDef = {
  event: string;
  modifiers: string[];
};

/** A trigger paired with its resolved subject (URL, store ref, etc.) */
export type TriggerSubjectPair = {
  trigger: TriggerDef | null;
  subject: string | null;
};

/** Base directive type. */
export interface BaseDirective {
  slug: DirectiveSlug;
  existsOn: (el: Element) => boolean;
  getValue: (el: Element) => string | null;
  [key: string]: unknown;
}

/**
 * A directive that establishes a persistent data or event binding between
 * the DOM and application state. These bindings can be scoped locally to
 * a controller or mounted globally against reactive stores.
 */
export interface BoundDirective extends BaseDirective {
  attach: (
    el: Element,
    scope: Controller,
    app: RouseApp,
    key: string,
    value: string,
  ) => BoundCleanupFn | void;
}

/** A directive that parses its attribute value into a typed config object. */
export interface ConfigDirective<T> extends BaseDirective {
  getConfig: (el: Element, ...args: any[]) => T;
}

/** A directive that manages the lifecycle and wiring of related directives. */
export interface ManagerDirective<T extends Element = Element> extends BaseDirective {
  initialize: (el: T, app: RouseApp) => void;
  teardown: (el: T) => void;
}

/** The kind of network action a directive describes. */
export type NetworkAction = 'fetch' | 'save' | 'refresh';

/** Custom error statuses for non-HTTP failures */
export type CustomErrorStatus =
  | 'CANCELED' // User or AbortController canceled the request
  | 'TIMEOUT' // Request exceeded timeout threshold
  | 'NETWORK_ERROR' // Fetch failed (offline, DNS, CORS, etc.)
  | 'PARSE_ERROR' // Response body couldn't be parsed
  | 'INTERNAL_ERROR' // Unexpected error in request engine
  | 'REDIRECTED'; // Cross-origin redirect refused by the fetch engine

/** HTTP status codes (2xx-5xx) or custom error status */
export type ErrorStatus = CustomErrorStatus | number;

/** Normalized error object */
export interface RequestError {
  message: string;
  status: ErrorStatus;
  original?: any;
  detail?: string;
  validation?: Record<string, string>;
  parseError?: string;
}

/** Framework-specific execution and UI options */
export interface FetchConfig {
  url?: string;
  target?: Element | string;
  triggerEl?: Element;
  body?: BodyInit | Record<string, any> | any[] | null | undefined;
  form?: HTMLFormElement;
  params?: Record<
    string,
    string | number | boolean | null | undefined | string[] | number[]
  >;
  mutate?: boolean;
  dispatchEvents?: boolean;
  skipInterceptors?: boolean;
  retry?: number;
  retryDelay?: number | ((attempt: number) => number);
  /** When true, auto-revert local state on save failure. Ignored by fetch and refresh. */
  rollbackOnError?: boolean;
  timeout?: number;
  abortKey?: string | symbol;
}

/** The final unified options object passed into ctx.fetch */
export type RouseRequest = Omit<RequestInit, 'body'> & FetchConfig;

/** The enhanced response object returned by ctx.fetch and request() */
export interface RouseResponse<T = any> {
  data: T | null;
  error: RequestError | null;
  response: Response | null;
  headers: Record<string, string> | null;
  status: number | null;
  config: RouseRequest;
  targetOverride?: string | null;
}

// Network interceptors

export type RequestInterceptor = (
  config: RouseRequest,
) => RouseRequest | Promise<RouseRequest>;

export type ResponseInterceptor = (
  data: any,
  response: Response,
  config: RouseRequest,
) => any | Promise<any>;

export type ErrorInterceptor = (
  error: RequestError,
  config: RouseRequest,
) => RequestError | Promise<RequestError>;

export type InterceptorPhase = 'request' | 'response' | 'error';

/** The definition of a setup function. */
export type ControllerFn<
  P extends Record<string, any> = Record<string, any>,
  T extends Element = HTMLElement,
> = (ctx: ControllerCtx<P, T>) => Controller;

/**
 * The context object passed into every controller setup function.
 * @template P - The type of the props.
 * @template T - The Element type.
 */
export type ControllerCtx<
  P extends Record<string, any> = Record<string, any>,
  T extends Element = HTMLElement,
> = {
  scope: T;
  root: HTMLElement;
  props: P;
  stores: StoreManager;
  term: AbortSignal;
  dispatch: {
    <N extends string>(
      name: N,
      detail?: N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any,
      options?: CustomEventInit,
    ): CustomEvent<N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any>;
    <N extends string>(
      target: EventTarget,
      name: N,
      detail?: N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any,
      options?: CustomEventInit,
    ): CustomEvent<N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any>;
  };
  on: {
    <N extends string>(
      events: N,
      callback: (
        ev: CustomEvent<N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any>,
      ) => void,
      customSignal?: AbortSignal,
    ): () => void;
    <N extends string>(
      target: EventTarget,
      events: N,
      callback: (
        ev: CustomEvent<N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any>,
      ) => void,
      customSignal?: AbortSignal,
    ): () => void;
  };
  fetch: (resource: string, options?: RouseRequest) => Promise<RouseResponse>;
  insert: (content: string, target: Element, method: InsertMethod) => void;
  scan: (newNode: Element) => void;
};

/**
 * The context object passed as an argument to controller methods.
 * @template P - The type of the props.
 * @template T - The Element type.
 */
export type HandlerCtx<P = Record<string, any>, T extends Element = HTMLElement> = {
  props: P;
  el: T;
  e: Event;
};
