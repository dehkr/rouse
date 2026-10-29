import type { RouseApp } from './core/app';
import type {
  DirectiveSlug,
  ListenTarget,
  PlacePosition,
  RENDER_FRAME,
} from './core/constants';

export type { DirectiveSlug };

/** Brand for {@link BoundCleanupFn}, keeping arbitrary `VoidFn`s out of directive-teardown positions. */
declare const CLEANUP: unique symbol;

/** Detail for `rz:app:start`, `rz:app:ready`, and `rz:app:destroy`. */
export interface AppEventDetail {
  /** The app instance the event fired from. */
  app: RouseApp;
}

/** Detail for `rz:scope:init`. */
export interface ScopeInitDetail {
  /** The context passed into the scope's setup function. */
  context: ScopeCtx;
  /** The scope object the setup function returned. */
  instance: Scope;
}

/** Detail for `rz:scope:connect`, `rz:scope:disconnect`, and `rz:scope:destroy`. */
export interface ScopeLifecycleDetail {
  /**
   * The scope object its setup function returned. On `rz:scope:destroy` it is
   * already torn down, so use it to recognize the scope rather than to call it.
   */
  instance: Scope;
}

/** Detail for `rz:fetch:config`, `rz:fetch:start`, `rz:fetch:abort`, and `rz:fetch:end`. */
export interface FetchConfigDetail {
  /**
   * The request config, the same object the interceptors receive and the response
   * carries. A `rz:fetch:config` listener can change it in place, including `url` and
   * `method`. Replacing the object has no effect on the request.
   */
  config: FetchRequest;
}

/** Detail for `rz:fetch:success`: the full response object. */
export type FetchSuccessDetail = RouseResponse;

/** Detail for `rz:fetch:success:json`: response with a parsed-JSON body (object/array). */
export type FetchSuccessJsonDetail = RouseResponse<Record<string, any> | any[]>;

/** Detail for `rz:fetch:success:html`: response with an HTML/text body, or an empty one carrying `Rouse-Place`. */
export type FetchSuccessHtmlDetail = RouseResponse<string>;

/** Detail for `rz:fetch:success:file`: response with a binary body (Blob/ArrayBuffer). */
export type FetchSuccessFileDetail = RouseResponse<Blob | ArrayBuffer>;

/** Detail for `rz:fetch:error`: the full response object. */
export type FetchErrorDetail = RouseResponse;

/** Detail for `rz:fetch:error:json`: error response with a parsed-JSON body (object/array). */
export type FetchErrorJsonDetail = RouseResponse<Record<string, any> | any[]>;

/** Detail for `rz:fetch:error:html`: error response with an HTML/text body, or an empty one carrying `Rouse-Place`. */
export type FetchErrorHtmlDetail = RouseResponse<string>;

/** Detail for `rz:fetch:error:file`: error response with a binary body (Blob/ArrayBuffer). */
export type FetchErrorFileDetail = RouseResponse<Blob | ArrayBuffer>;

/** Detail for `rz:push` and `rz:pull` `:config`, `:start`, `:abort`, and `:end`. */
export interface PushPullConfigDetail {
  /** Name of the store being synced. */
  storeName: string;
  /**
   * The request config, the same object the interceptors receive and the response
   * carries. A `:config` listener can change it in place, including `url`. Replacing
   * the object has no effect on the request.
   */
  config: FetchRequest;
}

/** A stream's resolved connection config, carried on every `rz:sse:*` detail. */
export interface SseConnectionConfig {
  /** The stream endpoint. */
  url: string;
  /** Whether the connection sends credentials cross-origin. */
  withCredentials: boolean;
  /** The element that declared the stream. Unset for a trigger-less `app.sse`. */
  triggerEl?: Element;
}

/** Why a stream ended. */
export type SseCloseReason =
  /** The host element left the DOM, or the app was destroyed. */
  | 'teardown'
  /** An `rz-close` trigger fired, or the last programmatic holder released. */
  | 'released'
  /** A listener prevented `rz:sse:error`, suppressing the reconnect. */
  | 'canceled'
  /** The server rejected the connection (non-200 or wrong content type). */
  | 'failed';

/** Detail for `rz:sse:open`. */
export interface SseConnectionDetail {
  /** The stream's connection config. */
  config: SseConnectionConfig;
}

/** Detail for `rz:sse:close`. */
export interface SseCloseDetail extends SseConnectionDetail {
  /** What ended the stream. */
  reason: SseCloseReason;
}

/**
 * Detail for `rz:sse:config`; cancelable, fires once before the initial attempt.
 * Listeners can mutate `config` in place; replacing the object has no effect.
 */
export interface SseConfigDetail extends SseConnectionDetail {}

/** Detail for `rz:sse:message`. */
export interface SseMessageDetail<T = unknown> extends SseConnectionDetail {
  /** The server's event name, or `'message'` for an unnamed event. */
  event: string;
  /** The message body, parsed as JSON when it parses to an object or array. */
  data: T;
  /** The unparsed `data:` field, as sent. */
  raw: string;
  /** The server's `id:` field, or an empty string when absent. */
  lastEventId: string;
}

/** Detail for `rz:sse:message:json`: a message whose body parsed to an object or array. */
export type SseMessageJsonDetail = SseMessageDetail<Record<string, any> | any[]>;

/** Detail for `rz:sse:message:html`: a message whose body is text. */
export type SseMessageHtmlDetail = SseMessageDetail<string>;

/**
 * Detail for `rz:sse:error`; cancelable. The connection dropped, and the default
 * action is the platform's automatic reconnect. `preventDefault()` closes instead.
 */
export interface SseErrorDetail extends SseConnectionDetail {
  /** Consecutive failed attempts, reset to zero on every successful `rz:sse:open`. */
  attempt: number;
}

/** Detail for `rz:push`/`rz:pull` `:success` and `:error`: the full response, plus the store name. */
export interface PushPullResultDetail {
  /** Name of the store being synced. */
  storeName: string;
  /** The full response object that settled the request. */
  result: RouseResponse;
}

/** Shared fields present on every `rz:store:patch:*` event detail. */
export interface BaseStorePatch {
  /** Name of the store being patched. */
  storeName: string;
  /** Network operation that produced the payload. */
  operation: 'push' | 'pull' | 'fetch' | 'sse';
}

/** Detail for `rz:store:patch`. */
export interface StorePatchDetail extends BaseStorePatch {
  /** The store's local data after the successful patch. */
  data: any;
  /** The response that drove the patch. */
  response?: RouseResponse;
  /** The server payload applied to the store, when provided. */
  payload?: any;
}

/** Detail for `rz:store:patch:before`. */
export interface StorePatchBeforeDetail extends BaseStorePatch {
  /** The store's current local data, about to be patched. */
  data: any;
  /** The server payload about to be applied, when provided. */
  payload?: any;
}

/** Detail for `rz:store:patch:skipped`. */
export interface StorePatchSkippedDetail extends BaseStorePatch {
  /** The store's local data, with the unsaved edits that were kept. */
  localData: any;
  /** The server payload that was not applied. */
  serverData: any;
  /** The response carrying the server data. */
  response: RouseResponse;
}

/** Detail for `rz:dom:place:before` and `rz:dom:place`. */
export interface DomPlaceDetail {
  /** The element being mutated. */
  target: Element;
  /** Where the payload was placed relative to `target`. */
  position: PlacePosition;
  /** The HTML string to insert. Mutable by `rz:dom:place:before` listeners. */
  payload: string;
  /** What produced the placement: a fetch response, a stream message, or a programmatic `place()` call. */
  source: 'fetch' | 'sse' | 'programmatic';
}

/** Options for `app.place()`. */
export interface PlaceOptions {
  /** Where the content goes relative to the target. Defaults to `innerHTML`. */
  position?: PlacePosition;
}

/** Maps every lifecycle event name to the shape of `event.detail`. */
export interface LifecycleEventMap {
  /** Fires when the app starts, before the initial directive scan. */
  'rz:app:start': AppEventDetail;
  /** Fires after the initial scan completes and the app is ready. */
  'rz:app:ready': AppEventDetail;
  /** Fires when the app instance is destroyed. */
  'rz:app:destroy': AppEventDetail;
  /** Fires after the setup function runs, before bindings attach. */
  'rz:scope:init': ScopeInitDetail;
  /** Fires when scope bindings are attached. */
  'rz:scope:connect': ScopeLifecycleDetail;
  /** Fires when scope bindings are detached. */
  'rz:scope:disconnect': ScopeLifecycleDetail;
  /** Fires when the scope is torn down. */
  'rz:scope:destroy': ScopeLifecycleDetail;
  /** Fires before the request is sent; cancelable. Listeners can mutate `config`. */
  'rz:fetch:config': FetchConfigDetail;
  /** Fires when the fetch starts, after config. */
  'rz:fetch:start': FetchConfigDetail;
  /** Fires if the fetch is aborted. */
  'rz:fetch:abort': FetchConfigDetail;
  /** Fires when the request settles, after success, error, or abort. */
  'rz:fetch:end': FetchConfigDetail;
  /** Fires when the request completes with an OK status. */
  'rz:fetch:success': FetchSuccessDetail;
  /** Fires after `rz:fetch:success` when the body is parsed JSON (object/array). */
  'rz:fetch:success:json': FetchSuccessJsonDetail;
  /** Fires after `rz:fetch:success` when the body is HTML/text. */
  'rz:fetch:success:html': FetchSuccessHtmlDetail;
  /** Fires after `rz:fetch:success` when the body is a Blob/ArrayBuffer. */
  'rz:fetch:success:file': FetchSuccessFileDetail;
  /** Fires when the request fails (non-OK status, network error, or timeout). */
  'rz:fetch:error': FetchErrorDetail;
  /** Fires after `rz:fetch:error` when the body is parsed JSON (object/array). */
  'rz:fetch:error:json': FetchErrorJsonDetail;
  /** Fires after `rz:fetch:error` when the body is HTML/text. */
  'rz:fetch:error:html': FetchErrorHtmlDetail;
  /** Fires after `rz:fetch:error` when the body is a Blob/ArrayBuffer. */
  'rz:fetch:error:file': FetchErrorFileDetail;
  /** Fires before a push is sent; cancelable. Listeners can mutate `config`. */
  'rz:push:config': PushPullConfigDetail;
  /** Fires when the push starts, after config. */
  'rz:push:start': PushPullConfigDetail;
  /**
   * Fires if the push is canceled. A store sends one push at a time and a push
   * carries no abort key, so this doesn't happen in practice. It exists because
   * every request event family has the same set of events.
   */
  'rz:push:abort': PushPullConfigDetail;
  /** Fires when the push completes with an OK status. */
  'rz:push:success': PushPullResultDetail;
  /** Fires when the push fails (non-OK status or network error). */
  'rz:push:error': PushPullResultDetail;
  /** Fires when the push settles, after success/error/abort. */
  'rz:push:end': PushPullConfigDetail;
  /** Fires before a pull is sent; cancelable. Listeners can mutate `config`. */
  'rz:pull:config': PushPullConfigDetail;
  /** Fires when the pull starts, after config. */
  'rz:pull:start': PushPullConfigDetail;
  /** Fires if the pull is aborted (overlapping programmatic pulls sharing an abortKey). */
  'rz:pull:abort': PushPullConfigDetail;
  /** Fires when the pull completes with an OK status. */
  'rz:pull:success': PushPullResultDetail;
  /** Fires when the pull fails (non-OK status or network error). */
  'rz:pull:error': PushPullResultDetail;
  /** Fires when the pull settles, after success/error/abort. */
  'rz:pull:end': PushPullConfigDetail;
  /** Fires once before the initial connection attempt; cancelable. Listeners can mutate `config`. */
  'rz:sse:config': SseConfigDetail;
  /** Fires when the stream connects, and again after every successful reconnect. */
  'rz:sse:open': SseConnectionDetail;
  /** Fires for every message the server sends, named or unnamed. */
  'rz:sse:message': SseMessageDetail;
  /** Fires after `rz:sse:message` when the body parsed to an object or array. */
  'rz:sse:message:json': SseMessageJsonDetail;
  /** Fires after `rz:sse:message` when the body is text. */
  'rz:sse:message:html': SseMessageHtmlDetail;
  /** Fires when the connection drops; cancelable. Preventing it suppresses the reconnect. */
  'rz:sse:error': SseErrorDetail;
  /** Fires when the stream has ended and will not reopen on its own. */
  'rz:sse:close': SseCloseDetail;
  /** Fires before a payload is applied to the local store; cancelable, and `payload` is mutable. Check `detail.operation` for what produced it. */
  'rz:store:patch:before': StorePatchBeforeDetail;
  /** Fires after a payload has been applied to the local store. Check `detail.operation` for what produced it. */
  'rz:store:patch': StorePatchDetail;
  /** Fires when the response carries server data but the store was edited while the request was in flight, so the server data is not applied and the local edit is kept. Push and pull only. */
  'rz:store:patch:skipped': StorePatchSkippedDetail;
  /** Fires before the content is placed; cancelable. Listeners can mutate `payload`. */
  'rz:dom:place:before': DomPlaceDetail;
  /** Fires after the content has been placed in the DOM. */
  'rz:dom:place': DomPlaceDetail;
}

/** Union of every lifecycle event name the framework can dispatch. */
export type LifecycleEvent = keyof LifecycleEventMap;

/** The `rz:store:patch*` subset, fired from a store's element. */
export type StorePatchEvent = Extract<LifecycleEvent, `rz:store:patch${string}`>;

/** Any value that a reactive directive can bind to. Objects are used for conditional class/style maps; primitives for direct output. */
export type BindableValue =
  | string
  | string[]
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean>
  | Record<string, string>;

/** Any callable. Used where a function's signature is intentionally unconstrained. */
export type AnyFn = (...args: any[]) => any;

/** A no-argument, no-return function. */
export type VoidFn = () => void;

/** An event handler that optionally receives the triggering `Event`. */
export type ActionFn = (e?: Event) => void;

/** A teardown function returned by a bound directive. Branded to prevent accidental misuse. */
export type BoundCleanupFn = VoidFn & { [CLEANUP]: true };

/** The object returned by a setup function. Includes standard lifecycle hooks and custom state/methods. */
export type Scope = Record<string, any> & {
  /** Lifecycle hook, run when the scope connects (bindings attached). */
  connect?: () => void;
  /** Lifecycle hook, run when the scope disconnects (bindings detached). */
  disconnect?: () => void;
};

/**
 * One `rz-render` instance's own state: its item, its position, and the state it
 * layers over. Read by `%`, and snapshotted for handlers as `HandlerCtx.render`.
 */
export interface RenderFrame {
  /** The current loop item. Absent for item-less (boolean/number) render modes. */
  item: unknown;
  /** Zero-based position of this instance within the render. */
  index: number;
  /** The parent state this instance's context layers over. */
  parent: Scope;
}

/**
 * The per-instance binding context an `rz-render` template instance is bound with.
 *
 * Structurally it's a `Scope` (so it threads through `bindDirectives` and the resolution chain unchanged) plus one
 * reserved symbol slot holding the instance's `RenderFrame`. Not a real `rz-scope`: no lifecycle, no `ScopeCtx`.
 */
export type RenderContext = Scope & {
  [RENDER_FRAME]?: RenderFrame;
};

/**
 * The canonical, resolved representation of a trigger's modifiers.
 *
 * The HTML grammar (`click|debounce-[300ms].once`) is its serialized form, produced by
 * `parseTriggers`. Consumers read fields from this object rather than scanning tokens.
 */
export interface TriggerModifiers {
  /** Remove the listener after it fires. Events rejected by a filter don't count. */
  once?: boolean;
  /** Listen during the capture phase. */
  capture?: boolean;
  /** Attach as a passive listener. */
  passive?: boolean;

  /** Attach the listener elsewhere. Filters and trigger sources still act on the element. */
  listenOn?: ListenTarget;
  /** Fire only for events originating outside the element. Listens on `document`. */
  outside?: boolean;

  /** Fire only when the element is the event target, not a descendant. */
  self?: boolean;
  /** Allow unrequested system modifiers to be held. */
  loose?: boolean;
  /** `KeyboardEvent.key` value(s) to match, compared case-insensitively. */
  key?: string | string[];
  /** Require the Control key. */
  ctrl?: boolean;
  /** Require the Alt key. */
  alt?: boolean;
  /** Require the Shift key. */
  shift?: boolean;
  /** Require the Meta key. */
  meta?: boolean;

  /** Call `preventDefault()` before the action runs. */
  prevent?: boolean;
  /** Call `stopPropagation()` before the action runs. */
  stop?: boolean;
  /** Call `stopImmediatePropagation()` before the action runs. */
  stopImmediate?: boolean;

  /** Debounce the action. `true` uses the default wait. */
  debounce?: number | string | true;
  /** Throttle the action. `true` uses the default wait. */
  throttle?: number | string | true;
  /** Run on the leading edge of the timing window. */
  leading?: boolean;
  /** Run on the trailing edge of the timing window. */
  trailing?: boolean;
}

/** The argument each trigger source takes, by trigger name. */
export interface TriggerSourceArgs {
  /** How long to wait, in milliseconds or as a duration such as `'5s'`. */
  timeout: number | string;
  /** How often to fire, in milliseconds or as a duration such as `'10s'`. */
  interval: number | string;
  /** The media query to match, such as `'(min-width: 640px)'`. */
  media: string;
  /** How much of the element must be visible to fire, from 0 to 1. */
  intersect: number;
  /** The server event name to listen for. */
  sse: string;
  /** The store to watch and an optional path into it, such as `'cart.items'`. */
  edit: string;
}

/** A trigger source's argument, of any source. */
export type TriggerArg = TriggerSourceArgs[keyof TriggerSourceArgs];

/** Trigger sources that can't be named by a string alone, since they need an argument. */
export type RequiredArgSource = Exclude<keyof TriggerSourceArgs, 'intersect'>;

/**
 * A trigger source with its argument, written as an object with one key:
 * `{ interval: '10s' }`, `{ edit: 'cart.items' }`. It's the `app.on` form of the
 * `interval-[10s]` trigger in HTML.
 */
export type TriggerDescriptor = {
  [K in keyof TriggerSourceArgs]: { [P in K]: TriggerSourceArgs[K] } & {
    [P in Exclude<keyof TriggerSourceArgs, K>]?: never;
  };
}[keyof TriggerSourceArgs];

/** Parsed trigger event with its resolved modifiers. */
export type TriggerDef = {
  /** The DOM event or trigger-source name, stripped of its argument and modifiers. */
  event: string;
  /**
   * The trigger's raw bracketed argument (`timeout-[5s]`). Resolved into the
   * source's argument at dispatch.
   */
  arg?: string;
  /** The trigger's resolved modifiers. */
  options: TriggerModifiers;
};

/** A trigger paired with its subject. `subject` is `null` when the directive resolves the URL/target from the element itself. */
export type TriggerSubjectPair = {
  /** The parsed trigger event and its modifiers. */
  trigger: TriggerDef;
  /** The URL/target the trigger acts on, or `null` when resolved from the element. */
  subject: string | null;
};

/**
 * The event type a name yields: a lifecycle event's typed detail, a native event's
 * own type, or `CustomEvent<any>` for names the DOM doesn't define.
 */
export type TriggerEvent<S extends string> = S extends keyof LifecycleEventMap
  ? CustomEvent<LifecycleEventMap[S]>
  : S extends keyof HTMLElementEventMap
    ? HTMLElementEventMap[S]
    : S extends keyof WindowEventMap
      ? WindowEventMap[S]
      : CustomEvent<any>;

/** A listener callback, or an object with `handleEvent`, as `addEventListener` accepts. */
export type EventCallback<E> = ((ev: E) => void) | { handleEvent(ev: E): void };

/** A stateless directive used to parse DOM attributes into a typed configuration object. */
export interface ConfigDirective<T> {
  /** Parse the element's attributes into the typed config `T`. Pure. No lifecycle, read on demand. */
  getConfig: (el: Element, ...args: any[]) => T;
}

/** Represents a persistent data or event binding between the DOM and application state. */
export interface BoundDirective {
  /** The `rz-*` attribute name (prefix omitted) this directive handles. */
  slug: DirectiveSlug;
  /** CSS selector string for elements with this directive. */
  selector: string;
  /**
   * Bind only the first `[key: value]` segment, warning that the rest are ignored.
   * Set on directives that bind one subject per element, where extra comma-separated
   * segments would create competing bindings on an element.
   */
  singleValue?: boolean;
  /**
   * Attach the binding for one pre-split `[key: value]` segment: `key` is the
   * trigger/token, `value` the subject. `scope` is the owning `Scope`, or `EMPTY_SCOPE`
   * when globally mounted. Returns a cleanup, or `undefined` if nothing was bound.
   */
  bind: (
    el: Element,
    scope: Scope,
    app: RouseApp,
    key: string,
    value: string,
  ) => BoundCleanupFn | undefined;
}

/** A directive that manages its own explicit initialization and teardown lifecycle. */
export interface StandaloneDirective<T extends Element = Element> {
  /** CSS selector string for elements with this directive. */
  selector: string;
  /** Set up the directive on `el`. Called by the initial scan and the mutation observer's add branch. */
  initialize: (el: T, app: RouseApp) => void;
  /** Tear down the directive when `el` leaves the DOM. */
  teardown: (el: T) => void;
}

/**
 * Codes for failures an HTTP status doesn't describe.
 *
 * - `CANCELED`: User or AbortController canceled the request.
 * - `TIMEOUT`: Request exceeded timeout threshold.
 * - `NETWORK_ERROR`: Fetch failed (offline, DNS, CORS, etc.).
 * - `PARSE_ERROR`: Response body couldn't be parsed.
 * - `INTERNAL_ERROR`: Unexpected error in request engine.
 * - `REDIRECTED`: Cross-origin redirect refused by the fetch engine.
 */
export type CustomErrorCode =
  | 'CANCELED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'INTERNAL_ERROR'
  | 'REDIRECTED';

/** An HTTP status code, or a custom error code. */
export type ErrorCode = CustomErrorCode | number;

/** Normalized error object. Can include a parsed response body for non-OK HTTP responses (JSON object/array or text/HTML string). */
export interface RequestError {
  /** Human-readable description of the failure. */
  message: string;
  /** The HTTP status code, or a custom code for failures an HTTP status doesn't describe. */
  code: ErrorCode;
  /** The underlying thrown value (native `Error`, `DOMException`, etc.) for non-HTTP failures. */
  original?: any;
  /** Parsed error-response body, for inspection. Aliases `result.data`. Mutating it affects what gets routed/rendered. */
  body?: unknown;
  /** Present with a PARSE_ERROR code; describes why the response body couldn't be parsed. */
  parseError?: string;
}

/** Request options shared by `rz-fetch` and store sync (`rz-push`/`rz-pull`). */
export interface BaseRequestConfig {
  /**
   * The request URL. On a request in progress it's absolute, resolved against `baseUrl`,
   * and doesn't include the query string `params` adds. A `:config` listener or a request
   * interceptor can change it to send the request somewhere else.
   */
  url?: string;
  /**
   * Elements that receive the `rouse-request` class while the request is in flight:
   * an element, or a CSS selector matched within the app root. `null` sets none.
   */
  indicator?: string | Element | null;
  /**
   * The element that initiated the request. Set by the declarative path. Programmatic
   * requests leave it unset unless the caller supplies one. On a fetch, supplying one
   * adopts the element's declarative setup and behavior, including accepting HTML responses
   * as its content (unless configured otherwise by `rz-place`). Leave it unset to handle
   * responses manually.
   */
  triggerEl?: Element;
  /** Request headers. A `null` value removes the header. Empty strings are sent as-is. */
  headers?: Record<string, string | null>;
  /** Added to the URL's query string. Each key replaces any value the URL already has for it. */
  params?: Record<
    string,
    string | number | boolean | null | undefined | Array<string | number | boolean>
  >;
  /** Skip all registered interceptors for this request. Programmatic only. */
  skipInterceptors?: boolean;
  /** Abort the request after this many milliseconds. */
  timeout?: number;
  /**
   * Groups requests so they don't overlap. A new read replaces an older one still in
   * flight. While a fetch that writes is in flight, new fetches with the same key are
   * ignored until it finishes.
   */
  abortKey?: string | symbol;
}

/** Options for a fetch. */
export interface FetchConfig extends BaseRequestConfig {
  /** Request body. Plain objects/arrays are JSON-serialized; a `BodyInit` is sent as-is. */
  body?: BodyInit | Record<string, any> | any[] | null | undefined;
  /**
   * The button that submitted the form, when `triggerEl` is a form. Its `formaction`,
   * `formmethod`, and `formenctype` override the form's own, and its name and value
   * are sent with the form's fields, as in a native submission.
   */
  submitter?: HTMLElement | null;
}

/** The final unified options object for a fetch. */
export type FetchRequest = Omit<RequestInit, 'body' | 'headers'> & FetchConfig;

/**
 * The authoring surface for a store push or pull. A push body is the store's own data
 * and a pull carries none, so `body` is absent by design. `method` is absent too: a
 * push is always `PATCH` (RFC 7396 merge patch), and a pull always `GET`.
 */
export type SyncRequest = Omit<RequestInit, 'body' | 'headers' | 'method'> &
  BaseRequestConfig;

/**
 * The callable fetch surface. The HTTP method comes from `options.method`,
 * defaulting to `GET`.
 */
export type RouseFetch = (
  resource: string,
  options?: FetchRequest,
) => Promise<RouseResponse>;

/** Options for `app.sse`. */
export interface SseOptions {
  /**
   * The element the connection binds to and dispatches from. Defaults to the app root.
   * Naming one adopts its declarative setup and behavior, including accepting HTML messages
   * as its content (unless configured otherwise by `rz-place`). Leave it unset to handle
   * messages manually.
   */
  triggerEl?: Element;
  /** Sends credentials on cross-origin connections. */
  withCredentials?: boolean;
  /** Closes the stream when aborted. Pass a scope's `term` to close it with the scope. */
  signal?: AbortSignal;
}

/**
 * The callable stream surface. Opens a connection, or joins one already open at the
 * same URL. Returns a closer that releases this caller's reference.
 */
export type RouseSse = (resource: string, options?: SseOptions) => VoidFn;

/** The enhanced response object returned by `app.fetch` and `request()`. */
export interface RouseResponse<T = any> {
  /** Parsed response body, or `null` on error or empty response. */
  data: T | null;
  /** Populated on non-OK responses or network failures; `null` on success. */
  error: RequestError | null;
  /** The raw `Response` object from `fetch`, or `null` for non-HTTP failures. */
  response: Response | null;
  /** Flattened response headers as a plain object, or `null` for non-HTTP failures. */
  headers: Record<string, string> | null;
  /** HTTP status code, or `null` for non-HTTP failures. */
  status: number | null;
  /** The resolved request config that produced this response. */
  config: FetchRequest;
  /** The server's replacement for the `rz-place` value (`Rouse-Place` header), if it sent one. */
  placeOverride?: string | null;
  /** The server's replacement for the `rz-deposit` value (`Rouse-Deposit` header), if it sent one. */
  depositOverride?: string | null;
}

/**
 * The minimum a payload needs to be routed by `rz-place` or `rz-deposit`. `RouseResponse`
 * satisfies it structurally, so both the fetch and stream paths reach the same routers
 * without either one adopting the other's detail type.
 */
export interface RoutablePayload {
  /** The payload to place. */
  data: unknown;
  /** Carries the element whose `rz-place` or `rz-deposit` names the destination. */
  config?: { triggerEl?: Element };
  /** Server-supplied `rz-place` override. Never set on the stream path. */
  placeOverride?: string | null;
  /** Server-supplied `rz-deposit` override. Never set on the stream path. */
  depositOverride?: string | null;
}

/**
 * Runs before a request is sent. Change the config in place, or return the fields to
 * change. Leaving a field out of the returned object doesn't remove it: set it to
 * `undefined` instead.
 */
export type RequestInterceptor = (
  config: FetchRequest,
) => FetchRequest | Promise<FetchRequest>;

/** Runs after a successful response is received. Return a modified value to override response data. */
export type ResponseInterceptor = (
  data: any,
  response: Response,
  config: FetchRequest,
) => any | Promise<any>;

/** Runs when a request fails. Return a modified error to override what propagates. */
export type ErrorInterceptor = (
  error: RequestError,
  config: FetchRequest,
) => RequestError | Promise<RequestError>;

/** The three points in the request lifecycle where interceptors can be registered. */
export type InterceptorPhase = 'request' | 'response' | 'error';

/** Options for `app.interceptor`. */
export interface InterceptorOptions {
  /** Removes the interceptor when aborted. Pass a scope's `term` to remove it with the scope. */
  signal?: AbortSignal;
}

/**
 * A scope setup function. Receives a `ScopeCtx` and returns a `Scope` object
 * whose properties become the scope's reactive state and methods.
 *
 * @template E - The Element type.
 */
export type ScopeSetup<E extends Element = HTMLElement> = (ctx: ScopeCtx<E>) => Scope;

/** Options for `app.on`: a trigger's modifiers, plus a caller abort signal. */
export type ListenerOptions = TriggerModifiers & {
  /** Combined with the app lifetime signal. Aborting removes the listener. */
  signal?: AbortSignal;
};

/** An event name `app.on` accepts as a string, excluding sources that need an argument. */
export type ListenerEventName<N extends string> = N extends RequiredArgSource ? never : N;

/**
 * The overload shape of `app.on`. Listens on the app root unless an `EventTarget`
 * is passed first. The event is a name, or a trigger source with its argument
 * (`{ interval: '10s' }`). Modifiers, filters, and timing are passed as options,
 * along with an optional `AbortSignal` combined with the app's lifetime signal.
 * Returns a teardown function.
 */
export type BoundOn = {
  <N extends string>(
    event: ListenerEventName<N>,
    callback: EventCallback<TriggerEvent<N>>,
    options?: ListenerOptions,
  ): VoidFn;
  (
    trigger: TriggerDescriptor,
    callback: EventCallback<CustomEvent<any>>,
    options?: ListenerOptions,
  ): VoidFn;
  <N extends string>(
    target: EventTarget,
    event: ListenerEventName<N>,
    callback: EventCallback<TriggerEvent<N>>,
    options?: ListenerOptions,
  ): VoidFn;
  (
    target: EventTarget,
    trigger: TriggerDescriptor,
    callback: EventCallback<CustomEvent<any>>,
    options?: ListenerOptions,
  ): VoidFn;
};

/**
 * The context object passed into every scope setup function.
 *
 * @template E - The Element type.
 */
export type ScopeCtx<E extends Element = HTMLElement> = {
  /** The `rz-scope` element this scope is mounted on. */
  host: E;
  /**
   * The app this scope is mounted in. Listeners, requests, streams, and interceptors
   * registered through it last as long as the app unless given `signal: term`, or
   * removed in `disconnect()`.
   */
  app: RouseApp;
  /**
   * Aborted when the scope is destroyed. Pass it as `signal` to `app.on`, `app.fetch`,
   * `app.sse`, or `app.interceptor` to end what they start along with the scope.
   */
  term: AbortSignal;
  /** Scan a newly added DOM subtree for directives and initialize them. */
  scan: (newNode: Element) => void;
};

/**
 * The context passed to handler functions: event handlers, one-way binding
 * formatters, and other scope/store methods.
 *
 * @template E - The Element type.
 */
export type HandlerCtx<E extends Element = HTMLElement> = {
  /** The element the directive is bound to. */
  el: E;
  /** The triggering DOM event, or a synthetic `CustomEvent` when the handler runs without one (e.g. a function used to compute a one-way binding value). */
  e: Event;
  /** Current `rz-render` loop context. Both fields are `null` outside a render instance, and `item` is `null` for item-less (boolean/number) modes. */
  render: { item: unknown; index: number | null };
};

/**
 * `HandlerCtx` for handlers bound inside an `rz-render` instance: the loop item
 * is typed, and `render` is guaranteed present (non-null).
 *
 * @template Item - The type of the render item.
 * @template E - The Element type.
 */
export type RenderHandlerCtx<Item, E extends Element = HTMLElement> = Omit<
  HandlerCtx<E>,
  'render'
> & {
  /** Current `rz-render` loop context. */
  render: { item: Item; index: number };
};
