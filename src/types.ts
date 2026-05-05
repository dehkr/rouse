import type { RouseApp } from './core/app';
import type { StoreManager } from './core/store';

export type DirectiveSlug =
  | 'bind'
  | 'error'
  | 'fetch'
  | 'fetch-on'
  | 'headers'
  | 'html'
  | 'model'
  | 'on'
  | 'refresh-on'
  | 'request'
  | 'save-on'
  | 'scope'
  | 'source'
  | 'store'
  | 'target'
  | 'text'
  | 'validate'
  | 'wake';

export type LifecycleEvent =
  | 'rz:app:start'
  | 'rz:app:ready'
  | 'rz:app:destroy'
  | 'rz:controller:init'
  | 'rz:controller:connect'
  | 'rz:controller:disconnect'
  | 'rz:controller:destroy'
  | 'rz:fetch:config'
  | 'rz:fetch:start'
  | 'rz:fetch:success'
  | 'rz:fetch:success:json'
  | 'rz:fetch:success:html'
  | 'rz:fetch:success:file'
  | 'rz:fetch:error'
  | 'rz:fetch:error:html'
  | 'rz:fetch:error:json'
  | 'rz:fetch:error:file'
  | 'rz:fetch:abort'
  | 'rz:fetch:end'
  | 'rz:fetch:update:dom:before'
  | 'rz:fetch:update:dom'
  | 'rz:fetch:update:store:before'
  | 'rz:fetch:update:store';

export type BindableValue =
  | string
  | string[]
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean> // For class bindings
  | Record<string, string>; // For style bindings

export const INSERT_METHODS = [
  'innerHTML',
  'outerHTML',
  'beforebegin',
  'afterbegin',
  'beforeend',
  'afterend',
  'delete',
] as const;

export type InsertMethod = (typeof INSERT_METHODS)[number];

export interface InsertOperation {
  targets: Element[];
  strategy: InsertMethod;
}

export function isInsertMethod(key: string): key is InsertMethod {
  return INSERT_METHODS.includes(key as InsertMethod);
}

declare const CLEANUP: unique symbol;
export type BoundCleanupFn = (() => void) & { [CLEANUP]: true };

export type AnyFunction = (...args: any[]) => any;
export type VoidFn = () => void;
export type ActionFn = (e?: Event) => void;

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

/** Base directive type. */
export interface BaseDirective {
  slug: DirectiveSlug;
  existsOn: (el: Element) => boolean;
  getValue: (el: Element) => string | null;
  [key: string]: unknown;
}

/** A directive that is bound to the DOM with a reactive effect. */
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

/** A directive that attaches event/poll triggers. */
export interface TriggerDirective extends BaseDirective {
  attachTriggers: (el: Element, ...args: any[]) => (() => void) | undefined;
}

/** A directive that manages the lifecycle and wiring of related directives. */
export interface ManagerDirective<T extends Element = Element> extends BaseDirective {
  initialize: (el: T, app: RouseApp) => void;
  teardown: (el: T) => void;
}

/** Custom error statuses for non-HTTP failures */
export type CustomErrorStatus =
  | 'CANCELED' // User or AbortController canceled the request
  | 'TIMEOUT' // Request exceeded timeout threshold
  | 'NETWORK_ERROR' // Fetch failed (offline, DNS, CORS, etc.)
  | 'PARSE_ERROR' // Response body couldn't be parsed
  | 'INTERNAL_ERROR'; // Unexpected error in request engine

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

/** Global fetch configuration */
export interface GlobalFetchConfig {
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  mode?: RequestMode;
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

/** Network interceptors */
export interface FetchInterceptors {
  onRequest?: (config: RouseRequest) => RouseRequest | Promise<RouseRequest>;
  onResponse?: (
    data: any,
    response: Response,
    config: RouseRequest,
  ) => any | Promise<any>;
  onError?: (
    error: RequestError,
    config: RouseRequest,
  ) => RequestError | Promise<RequestError>;
}

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
    <T extends string, D = any>(
      name: T | LifecycleEvent,
      detail?: D,
      options?: CustomEventInit,
    ): CustomEvent<D>;
    <T extends string, D = any>(
      target: EventTarget,
      name: T | LifecycleEvent,
      detail?: D,
      options?: CustomEventInit,
    ): CustomEvent<D>;
  };
  on: {
    <D = any>(
      events: string,
      callback: (ev: CustomEvent<D>) => void,
      customSignal?: AbortSignal,
    ): () => void;
    <D = any>(
      target: EventTarget,
      events: string,
      callback: (ev: CustomEvent<D>) => void,
      customSignal?: AbortSignal,
    ): () => void;
  };
  fetch: (resource: string, options?: RouseRequest) => Promise<RouseResponse>;
  insert: (content: string, target: Element, method: InsertMethod) => void;
  scan: (newNode: Element) => void;
};

/** The definition of a setup function. */
export type ControllerFunction<
  P extends Record<string, any> = Record<string, any>,
  T extends Element = HTMLElement,
> = (ctx: ControllerCtx<P, T>) => Controller;

/**
 * The context object passed as an argument to controller methods via `rz-on`.
 * @template P - The type of the props.
 * @template T - The Element type.
 */
export type ActionCtx<P = Record<string, any>, T extends Element = HTMLElement> = {
  el: T;
  e: Event;
  props?: P;
};
