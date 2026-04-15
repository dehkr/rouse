import type { RouseApp } from './core/app';
import type { StoreManager } from './core/store';
import type { InsertMethod } from './directives/rz-insert';

declare const CLEANUP: unique symbol;
export type CleanupFunction = (() => void) & { [CLEANUP]: true };

export type AnyFunction = (...args: any[]) => any;

export type BindableValue =
  | string
  | string[]
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean> // For class bindings
  | Record<string, string>; // For style bindings

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

export type DirectiveSlug =
  | 'bind'
  | 'fetch'
  | 'html'
  | 'insert'
  | 'model'
  | 'on'
  | 'refresh'
  | 'request'
  | 'save'
  | 'scope'
  | 'source'
  | 'store'
  | 'text'
  | 'trigger'
  | 'wake';

export interface BaseDirective<T extends Element = HTMLElement> {
  existsOn: (el: T) => boolean;
  getRawValue: (el: T) => string | null;
}

export interface Directive<T extends Element = HTMLElement> extends BaseDirective<T> {
  [key: string]: unknown;
}

export interface BoundDirective<T extends Element = HTMLElement> extends BaseDirective<T> {
  attach: (
    el: T,
    scope: Controller,
    app: RouseApp,
    key: string,
    value: string,
  ) => CleanupFunction;
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
  params?: Record<string, string | number | boolean | null | undefined>;
  mutate?: boolean;
  dispatchEvents?: boolean;
  skipInterceptors?: boolean;
  retries?: number;
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
}

/** Network interceptors */
export interface FetchInterceptors {
  onRequest?: (config: RouseRequest) => RouseRequest | Promise<RouseRequest>;
  onResponse?: (
    data: any,
    response: Response,
    config: RouseRequest,
  ) => any | Promise<any>;
  onError?: (error: any, config: RouseRequest) => void;
}

/**
 * The context object passed into every controller setup function.
 * @template P - The type of the props.
 */
export type SetupContext<
  P extends Record<string, any> = Record<string, any>,
  T extends Element = HTMLElement,
> = {
  scope: T;
  root: HTMLElement;
  props: P;
  stores: StoreManager;
  abortSignal: AbortSignal;
  dispatch: <T extends string, D = any>(
    target: EventTarget,
    name: T | LifecycleEvent,
    detail?: D,
    options?: CustomEventInit,
  ) => CustomEvent<D>;
  on: <D = any>(
    target: EventTarget,
    name: string,
    callback: (ev: CustomEvent<D>) => void,
    modifiers?: string[],
    customSignal?: AbortSignal,
  ) => () => void;
  fetch: (resource: string, options?: RouseRequest) => Promise<RouseResponse>;
  insert: (content: string, target: Element, method: InsertMethod) => void;
  scan: (newNode: Element) => void;
};

/** The definition of a setup function. */
export type SetupFunction<
  P extends Record<string, any> = Record<string, any>,
  T extends Element = HTMLElement,
> = (ctx: SetupContext<P, T>) => Controller;

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
  | 'rz:fetch:abort'
  | 'rz:fetch:end'
  | 'rz:fetch:insert:before'
  | 'rz:fetch:insert';
