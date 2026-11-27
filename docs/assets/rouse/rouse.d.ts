export declare function signal<T>(): {
  (): T | undefined;
  (value: T | undefined): void;
};
export declare function signal<T>(initialValue: T): {
  (): T;
  (value: T): void;
};
export declare function computed<T>(getter: (previousValue?: T) => T): () => T;
/** List of valid DOM placement positions. */
declare const PLACE_POSITIONS: readonly ["innerHTML", "outerHTML", "beforebegin", "afterbegin", "beforeend", "afterend", "delete"];
/** Represents a valid DOM placement position. */
type PlacePosition = (typeof PLACE_POSITIONS)[number];
/** Web Storage areas the `persist` option accepts: `localStorage` and `sessionStorage`. */
declare const PERSIST_STORAGES: readonly ["local", "session"];
/** Represents a `persist` option token. */
type PersistStorage = (typeof PERSIST_STORAGES)[number];
/** Modifiers naming a host for the listener other than the element itself. */
declare const LISTEN_TARGETS: readonly ["window", "document", "root"];
type ListenTarget = (typeof LISTEN_TARGETS)[number];
/** Detail for `rz:app:start`, `rz:app:ready`, and `rz:app:destroy`. */
interface AppEventDetail {
  /** The app instance the event fired from. */
  app: RouseApp;
}
/** Detail for `rz:scope:connect` and `rz:scope:disconnect`. */
interface ScopeLifecycleDetail {
  /** The scope's host element. Identifies the scope when the event fires from the app root. */
  host: HTMLElement;
  /**
   * The scope object its setup function returned. On `rz:scope:disconnect` it is
   * being torn down, so use it to recognize the scope rather than to call it.
   */
  instance: Scope;
}
/** Detail for `rz:fetch:config`. */
interface FetchConfigDetail {
  /**
   * The request config, the same object the interceptors receive and the response
   * carries. A `rz:fetch:config` listener can change it in place, including `url` and
   * `method`. Replacing the object has no effect on the request.
   */
  config: ResolvedRequest;
}
/** Detail for `rz:fetch:start`, `rz:fetch:abort`, and `rz:fetch:end`. */
interface FetchRequestDetail {
  /**
   * The request config, the same object `rz:fetch:config` carries. Read-only here:
   * change a request in a `rz:fetch:config` listener or a request interceptor.
   */
  config: ReadonlyRequest;
}
/** Detail for `rz:fetch:success`: the full response object. */
type FetchSuccessDetail = RouseResponse;
/** Detail for `rz:fetch:error`: the full response object. */
type FetchErrorDetail = RouseResponse;
/** Detail for `rz:push:config` and `rz:pull:config`. */
interface PushPullConfigDetail {
  /** Name of the store being synced. */
  storeName: string;
  /**
   * The request config, the same object the interceptors receive and the response
   * carries. A `:config` listener can change it in place, including `url`. Replacing
   * the object has no effect on the request.
   */
  config: ResolvedRequest;
}
/** Detail for `rz:push` and `rz:pull` `:start`, `:abort`, and `:end`. */
interface PushPullRequestDetail {
  /** Name of the store being synced. */
  storeName: string;
  /**
   * The request config, the same object `:config` carries. Read-only here: change a
   * request in a `:config` listener or a request interceptor.
   */
  config: ReadonlyRequest;
}
/** A stream's resolved connection config, carried on every `rz:sse:*` detail. */
interface SseConnectionConfig {
  /** The stream endpoint. */
  url: string;
  /** Whether the connection sends credentials cross-origin. */
  withCredentials: boolean;
  /** The element that declared the stream. Unset for a trigger-less `app.sse`. */
  triggerEl?: Element;
}
/** Why a stream ended. */
type SseCloseReason =
/** The host element left the DOM, or the app was destroyed. */
'teardown' |
/** An `rz-close` trigger fired, or the last programmatic holder released. */
'released' |
/** A listener prevented `rz:sse:error`, suppressing the reconnect. */
'canceled' |
/** The server rejected the connection (non-200 or wrong content type). */
'failed';
/** Detail for `rz:sse:open`. */
interface SseConnectionDetail {
  /** The stream's connection config. */
  config: SseConnectionConfig;
}
/** Detail for `rz:sse:close`. */
interface SseCloseDetail extends SseConnectionDetail {
  /** What ended the stream. */
  reason: SseCloseReason;
}
/**
 * Detail for `rz:sse:config`; cancelable, fires once before the initial attempt.
 * Listeners can mutate `config` in place; replacing the object has no effect.
 */
interface SseConfigDetail extends SseConnectionDetail {}
/** Detail for `rz:sse:message`. */
interface SseMessageDetail<T = unknown> extends SseConnectionDetail {
  /** The server's event name, or `'message'` for an unnamed event. */
  event: string;
  /** The message body, parsed as JSON when it parses to an object or array. */
  data: T;
  /** The unparsed `data:` field, as sent. */
  raw: string;
  /** The server's `id:` field, or an empty string when absent. */
  lastEventId: string;
}
/**
 * Detail for `rz:sse:error`; cancelable. The connection dropped, and the default
 * action is the platform's automatic reconnect. `preventDefault()` closes instead.
 */
interface SseErrorDetail extends SseConnectionDetail {
  /** Consecutive failed attempts, reset to zero on every successful `rz:sse:open`. */
  attempt: number;
}
/** Detail for `rz:push`/`rz:pull` `:success` and `:error`: the full response, plus the store name. */
interface PushPullResultDetail {
  /** Name of the store being synced. */
  storeName: string;
  /** The full response object that settled the request. */
  result: RouseResponse;
}
/** Shared fields present on every `rz:store:patch:*` event detail. */
interface BaseStorePatch {
  /** Name of the store being patched. */
  storeName: string;
  /** Network operation that produced the payload. */
  operation: 'push' | 'pull' | 'fetch' | 'sse';
}
/** Detail for `rz:store:patch`. */
interface StorePatchDetail extends BaseStorePatch {
  /** The store's local data after the successful patch. */
  data: any;
  /** The response that drove the patch. */
  response?: RouseResponse;
  /** The server payload applied to the store, when provided. */
  payload?: any;
}
/** Detail for `rz:store:patch:before`. */
interface StorePatchBeforeDetail extends BaseStorePatch {
  /** The store's current local data, about to be patched. */
  data: any;
  /** The server payload about to be applied, when provided. */
  payload?: any;
}
/** Detail for `rz:store:patch:skipped`. */
interface StorePatchSkippedDetail extends BaseStorePatch {
  /** The store's local data, with the unsaved edits that were kept. */
  localData: any;
  /** The server payload that was not applied. */
  serverData: any;
  /** The response carrying the server data. */
  response: RouseResponse;
}
/** Detail for `rz:dom:place:before` and `rz:dom:place`. */
interface DomPlaceDetail {
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
interface PlaceOptions {
  /** Where the content goes relative to the target. Defaults to `innerHTML`. */
  position?: PlacePosition;
}
/** Maps every lifecycle event name to the shape of `event.detail`. */
interface LifecycleEventMap {
  /** Fires when the app starts, before the initial directive scan. */
  'rz:app:start': AppEventDetail;
  /** Fires after the initial scan completes and the app is ready. */
  'rz:app:ready': AppEventDetail;
  /** Fires when the app instance is destroyed. */
  'rz:app:destroy': AppEventDetail;
  /** Fires when scope bindings are attached. */
  'rz:scope:connect': ScopeLifecycleDetail;
  /** Fires when scope bindings are detached. */
  'rz:scope:disconnect': ScopeLifecycleDetail;
  /** Fires before the request is sent; cancelable. Listeners can mutate `config`. */
  'rz:fetch:config': FetchConfigDetail;
  /** Fires once indicators apply. Request interceptors run and the request is sent after it. */
  'rz:fetch:start': FetchRequestDetail;
  /** Fires if the fetch is aborted. */
  'rz:fetch:abort': FetchRequestDetail;
  /** Fires when the request settles, after success, error, or abort. */
  'rz:fetch:end': FetchRequestDetail;
  /** Fires when the request completes with an OK status. */
  'rz:fetch:success': FetchSuccessDetail;
  /** Fires when the request fails (non-OK status, network error, or timeout). */
  'rz:fetch:error': FetchErrorDetail;
  /** Fires before a push is sent; cancelable. Listeners can mutate `config`. */
  'rz:push:config': PushPullConfigDetail;
  /** Fires once indicators apply. Request interceptors run and the push is sent after it. */
  'rz:push:start': PushPullRequestDetail;
  /** Fires if the push is canceled through the `signal` option. */
  'rz:push:abort': PushPullRequestDetail;
  /** Fires when the push completes with an OK status. */
  'rz:push:success': PushPullResultDetail;
  /** Fires when the push fails (non-OK status or network error). */
  'rz:push:error': PushPullResultDetail;
  /** Fires when the push settles, after success/error/abort. */
  'rz:push:end': PushPullRequestDetail;
  /** Fires before a pull is sent; cancelable. Listeners can mutate `config`. */
  'rz:pull:config': PushPullConfigDetail;
  /** Fires once indicators apply. Request interceptors run and the pull is sent after it. */
  'rz:pull:start': PushPullRequestDetail;
  /** Fires if the pull is aborted (overlapping programmatic pulls sharing an abortKey). */
  'rz:pull:abort': PushPullRequestDetail;
  /** Fires when the pull completes with an OK status. */
  'rz:pull:success': PushPullResultDetail;
  /** Fires when the pull fails (non-OK status or network error). */
  'rz:pull:error': PushPullResultDetail;
  /** Fires when the pull settles, after success/error/abort. */
  'rz:pull:end': PushPullRequestDetail;
  /** Fires once before the initial connection attempt; cancelable. Listeners can mutate `config`. */
  'rz:sse:config': SseConfigDetail;
  /** Fires when the stream connects, and again after every successful reconnect. */
  'rz:sse:open': SseConnectionDetail;
  /** Fires for every message the server sends, named or unnamed. */
  'rz:sse:message': SseMessageDetail;
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
type LifecycleEvent = keyof LifecycleEventMap;
/** Any value that a reactive directive can bind to. Objects are used for conditional class/style maps; primitives for direct output. */
type BindableValue = string | string[] | number | boolean | null | undefined | Record<string, boolean> | Record<string, string>;
/** A no-argument, no-return function. */
type VoidFn = () => void;
/** The object returned by a setup function. Includes standard lifecycle hooks and custom state/methods. */
type Scope = Record<string, any> & {
  /** Lifecycle hook, run when the scope connects (bindings attached). */
  connect?: () => void;
  /** Lifecycle hook, run when the scope disconnects (bindings detached). */
  disconnect?: () => void;
};
/**
 * The canonical, resolved representation of a trigger's modifiers.
 *
 * The HTML grammar (`click|debounce-[300ms].once`) is its serialized form, produced by
 * `parseTriggers`. Consumers read fields from this object rather than scanning tokens.
 */
interface TriggerModifiers {
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
interface TriggerSourceArgs {
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
/** Trigger sources that can't be named by a string alone, since they need an argument. */
type RequiredArgSource = Exclude<keyof TriggerSourceArgs, 'intersect'>;
/**
 * A trigger source with its argument, written as an object with one key:
 * `{ interval: '10s' }`, `{ edit: 'cart.items' }`. It's the `app.on` form of the
 * `interval-[10s]` trigger in HTML.
 */
type TriggerDescriptor = { [K in keyof TriggerSourceArgs]: { [P in K]: TriggerSourceArgs[K]; } & { [P in Exclude<keyof TriggerSourceArgs, K>]?: never; }; }[keyof TriggerSourceArgs];
/**
 * The event type a name yields: a lifecycle event's typed detail, a native event's
 * own type, or `CustomEvent<any>` for names the DOM doesn't define.
 */
type TriggerEvent<S extends string> = S extends keyof LifecycleEventMap ? CustomEvent<LifecycleEventMap[S]> : S extends keyof HTMLElementEventMap ? HTMLElementEventMap[S] : S extends keyof WindowEventMap ? WindowEventMap[S] : CustomEvent<any>;
/** A listener callback, or an object with `handleEvent`, as `addEventListener` accepts. */
type EventCallback<E> = ((ev: E) => void) | {
  handleEvent(ev: E): void;
};
/**
 * Codes for failures an HTTP status doesn't describe.
 *
 * - `CANCELED`: User or AbortController canceled the request.
 * - `TIMEOUT`: Request exceeded timeout threshold.
 * - `NETWORK_ERROR`: Fetch failed (offline, DNS, CORS, etc.).
 * - `PARSE_ERROR`: Response body couldn't be parsed.
 * - `INVALID_REQUEST`: Request can't be sent as written (a body on GET or HEAD, or
 *   a missing or unresolvable URL).
 * - `INTERNAL_ERROR`: Unexpected error in request engine.
 */
type CustomErrorCode = 'CANCELED' | 'TIMEOUT' | 'NETWORK_ERROR' | 'PARSE_ERROR' | 'INVALID_REQUEST' | 'INTERNAL_ERROR';
/** An HTTP status code, or a custom error code. */
type ErrorCode = CustomErrorCode | number;
/** Normalized error object. Can include a parsed response body for non-OK HTTP responses (JSON object/array or text/HTML string). */
interface RequestError {
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
interface BaseRequestConfig {
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
  params?: Record<string, string | number | boolean | null | undefined | Array<string | number | boolean>>;
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
interface FetchConfig extends BaseRequestConfig {
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
type FetchRequest = Omit<RequestInit, 'body' | 'headers'> & FetchConfig;
/**
 * A request config once Rouse has resolved it, as `:config` listeners and interceptors
 * see it. `url` is absolute, and `method` and `headers` are always set, so they can be
 * edited in place.
 */
type ResolvedRequest = FetchRequest & Required<Pick<FetchRequest, 'url' | 'method' | 'headers'>>;
/**
 * A request config as the events after `:config` see it: the same object, typed
 * read-only. `headers`, `params`, and `body` are read-only too, since a nested edit
 * would still reach the request.
 */
type ReadonlyRequest = Readonly<Omit<ResolvedRequest, 'headers' | 'params' | 'body'>> & {
  readonly headers: Readonly<ResolvedRequest['headers']>;
  readonly params?: Readonly<NonNullable<ResolvedRequest['params']>>;
  readonly body?: Readonly<ResolvedRequest['body']>;
};
/**
 * The callable fetch surface. The HTTP method comes from `options.method`,
 * defaulting to `GET`.
 */
type RouseFetch = (resource: string, options?: FetchRequest) => Promise<RouseResponse>;
/** Options for `app.sse`. */
interface SseOptions {
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
type RouseSse = (resource: string, options?: SseOptions) => VoidFn;
/** The enhanced response object returned by `app.fetch` and `request()`. */
interface RouseResponse<T = any> {
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
  /**
   * The request config that produced this response. Resolved, except on a response
   * returned without sending, such as a guard drop.
   */
  config: FetchRequest;
  /** The server's replacement for the `rz-place` value (`Rouse-Place` header), if it sent one. */
  placeOverride?: string | null;
  /** The server's replacement for the `rz-deposit` value (`Rouse-Deposit` header), if it sent one. */
  depositOverride?: string | null;
}
/**
 * Runs before a request is sent. Change the config in place and return nothing, or
 * return the fields to change. Leaving a field out of the returned object doesn't
 * remove it: set it to `undefined` instead.
 */
type RequestInterceptor = (config: ResolvedRequest) => FetchRequest | void | Promise<FetchRequest | void>;
/** Runs after a successful response is received. Return a modified value to override response data. */
type ResponseInterceptor = (data: any, response: Response, config: ResolvedRequest) => any | Promise<any>;
/** Runs when a request fails. Return a modified error to override what propagates. */
type ErrorInterceptor = (error: RequestError, config: ResolvedRequest) => RequestError | Promise<RequestError>;
/** Options for `app.interceptor`. */
interface InterceptorOptions {
  /** Removes the interceptor when aborted. Pass a scope's `term` to remove it with the scope. */
  signal?: AbortSignal;
}
/**
 * A scope setup function. Receives a `ScopeCtx` and returns a `Scope` object
 * whose properties become the scope's reactive state and methods.
 *
 * @template E - The Element type.
 */
type ScopeSetup<E extends Element = HTMLElement> = (ctx: ScopeCtx<E>) => Scope;
/** Options for `app.on`: a trigger's modifiers, plus a caller abort signal. */
type ListenerOptions = TriggerModifiers & {
  /** Combined with the app lifetime signal. Aborting removes the listener. */
  signal?: AbortSignal;
};
/** An event name `app.on` accepts as a string, excluding sources that need an argument. */
type ListenerEventName<N extends string> = N extends RequiredArgSource ? never : N;
/**
 * The overload shape of `app.on`. Listens on the app root unless an `EventTarget`
 * is passed first. The event is a name, or a trigger source with its argument
 * (`{ interval: '10s' }`). Modifiers, filters, and timing are passed as options,
 * along with an optional `AbortSignal` combined with the app's lifetime signal.
 * Returns a teardown function.
 */
type BoundOn = {
  <N extends string>(event: ListenerEventName<N>, callback: EventCallback<TriggerEvent<N>>, options?: ListenerOptions): VoidFn;
  (trigger: TriggerDescriptor, callback: EventCallback<CustomEvent<any>>, options?: ListenerOptions): VoidFn;
  <N extends string>(target: EventTarget, event: ListenerEventName<N>, callback: EventCallback<TriggerEvent<N>>, options?: ListenerOptions): VoidFn;
  (target: EventTarget, trigger: TriggerDescriptor, callback: EventCallback<CustomEvent<any>>, options?: ListenerOptions): VoidFn;
};
/**
 * The context object passed into every scope setup function.
 *
 * @template E - The Element type.
 */
type ScopeCtx<E extends Element = HTMLElement> = {
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
type HandlerCtx<E extends Element = HTMLElement> = {
  /** The element the directive is bound to. */
  el: E;
  /** The triggering DOM event, or a synthetic `CustomEvent` when the handler runs without one (e.g. a function used to compute a one-way binding value). */
  e: Event;
  /** Current `rz-render` loop context. Both fields are `null` outside a render instance. */
  render: {
    item: unknown;
    index: number | null;
  };
};
/**
 * `HandlerCtx` for handlers bound inside an `rz-render` instance: the loop item
 * is typed, and `render` is guaranteed present (non-null).
 *
 * @template Item - The type of the render item.
 * @template E - The Element type.
 */
type RenderHandlerCtx<Item, E extends Element = HTMLElement> = Omit<HandlerCtx<E>, 'render'> & {
  /** Current `rz-render` loop context. */
  render: {
    item: Item;
    index: number;
  };
};
type PluginName = 'sync' | 'sse';
/**
 * Saves the state to Web Storage on every change and restores it on creation.
 * `persist` and `persistKey` are passed together or not at all.
 */
type PersistOptions = {
  persist?: undefined;
  persistKey?: undefined;
} | {
  /** Where to save: `'local'` for `localStorage`, `'session'` for `sessionStorage`. */
  persist: PersistStorage;
  /** The storage key, used verbatim. Must be stable across page loads and unique on the page. */
  persistKey: string;
};
/** Options for `reactive()`. */
type ReactiveOptions = PersistOptions;
/**
 * Creates a reactive proxy for the target object.
 *
 * - If passed a raw object, it returns its reactive proxy (creating one if needed).
 * - If passed an existing proxy, it returns it as-is.
 * - If passed anything but a plain object or array (primitive, class instance,
 *   built-in such as `Map` or `Date`), it returns it as-is.
 *
 * The returned proxy is deeply reactive but lazy: nested properties are converted to
 * proxies only when accessed.
 *
 * **Persistence:** pass `persist` and `persistKey` to keep the state across page loads.
 * - The saved value is restored before the proxy is created. An object takes each saved
 *   field over its initial value, skipping getters and methods. An array is replaced.
 * - Every change saves the data fields as JSON. Getters and methods are never saved.
 * - Unreadable storage or a saved value of another type keeps the initial value.
 * - Saving stops with the scope when called during setup or `connect()`. Otherwise
 *   it runs for the page's lifetime.
 *
 * @template T - The type of the target object.
 * @param target - The object to make reactive.
 * @param options - `persist` (`'local'` or `'session'`) with a `persistKey` used verbatim
 *   as the storage key. Options apply only on the object's first `reactive()` call.
 * @returns The reactive proxy, or the original value if it cannot be proxied.
 * @throws If `persist` is not `'local'` or `'session'`, or `persistKey` is missing.
 *
 * @example
 * const state = reactive({ count: 0 });
 * effect(() => console.log(state.count));
 *
 * @example
 * const prefs = reactive({ theme: 'light' }, { persist: 'local', persistKey: 'prefs' });
 */
export declare function reactive<T extends object>(target: T, options?: ReactiveOptions): T;
/**
 * Runs `fn` and defers effects until it returns, so each effect runs at most once
 * for all the writes inside it. Returns `fn`'s result.
 *
 * - Reads inside `fn`, including computed values, return current state. Only effects
 *   wait, so the DOM updates when the outermost `batch()` returns.
 * - Nested calls run their effects once, when the outermost call returns.
 * - If `fn` throws, effects for the writes before the throw still run, and the error
 *   propagates.
 * - Writes after an `await` inside `fn` are not batched.
 *
 * @param fn - A synchronous function that writes state.
 */
export declare function batch<T>(fn: () => T): T;
/**
 * An optional feature, installed into one app through the `plugins` option of
 * `rouse()`. Load each plugin from the same release as the core library.
 */
interface RousePlugin {
  readonly name: PluginName;
  readonly version: string;
}
/**
 * Options a plugin adds to `app.store()`. Empty without one, so an option that needs a
 * plugin, such as the sync plugin's `url`, is a type error until that plugin is
 * installed.
 */
interface StoreOptions {}
/**
 * Manages one app's stores by name, as `app.stores`. Each app has its own, so stores
 * never cross between apps.
 */
declare class StoreManager {
  private app;
  private _stores;
  private _pendingFlush;
  private _isPatching;
  constructor(app: RouseApp);
  /**
   * Runs `fn` with edit tracking suppressed, then `report`, the one hook that announces
   * the write, in the same batch.
   */
  private _frameworkWrite;
  /**
   * Queues a store for an end-of-microtask flush, coalescing a batch of synchronous
   * writes into one `edited` call and one round of notifications.
   */
  private _scheduleFlush;
  /**
   * Replaces the store's data. Sends nothing. With the `sync` plugin, the new data is
   * also what `revert()` restores, and the store has no unsaved changes. Use it for
   * data the server already holds, such as a server render.
   */
  update<T extends object = any>(storeName: string | null | undefined, state: object): T;
  /**
   * Replaces the store's data and calls the `reseeded` hook. Shared by `update()` and a
   * re-declared script.
   */
  private _reseed;
  /**
   * Writes a payload into a store as a JSON Merge Patch, the way a fetch response
   * or a stream message routed by `data-rz-deposit="@store"` does. Fires the same
   * events a push or pull fires, so a listener sees one shape whatever produced
   * the payload.
   *
   * With the `sync` plugin, the payload's keys count as synced, as after a pull. Keys
   * it leaves out keep any unsaved changes.
   *
   * @returns `false` if the store does not exist or a listener canceled the patch.
   */
  deposit(storeName: string | null | undefined, payload: object, options?: {
    response?: RouseResponse;
    operation?: 'fetch' | 'sse';
  }): boolean;
  /**
   * Returns the reactive proxy for a store, or `undefined`.
   */
  get<T extends object = any>(storeName: string | null | undefined): T | undefined;
  /**
   * Returns a deep-cloned non-reactive copy of the store's current data.
   */
  snapshot<T = any>(storeName: string | null | undefined): T | undefined;
  /**
   * Returns `true` if a store with the provided name exists.
   */
  has(storeName: string | null | undefined): boolean;
  /**
   * Drops all per-store state from the manager. Intended for tear-down of
   * dynamically-created stores.
   *
   * Existing references to the proxy keep working but desync: edits through them
   * won't fire `edit` triggers, and an in-flight request won't
   * apply its response.
   */
  remove(storeName: string | null | undefined): void;
}
interface RouseConfig {
  /** Element or selector where the app mounts. Defaults to `document.documentElement`. */
  root?: string | HTMLElement;
  /**
   * Prepended to relative URLs in `rz-fetch` and `app.fetch()`, and in the requests and
   * streams of the `sync` and `sse` plugins.
   */
  baseUrl?: string;
  /** Default headers applied to every request. Merged with per-request and directive-level headers; a `null` value removes the header. */
  headers?: Record<string, string | null>;
  /** The fetch `credentials` value for every request. Defaults to the browser's `'same-origin'`. */
  credentials?: RequestCredentials;
  /** Abort every request after this many milliseconds. A per-request `timeout` overrides it; `0` (the default) means no deadline. */
  timeout?: number;
  /** Default scope activation strategy. Overridden by `rz-wake`. */
  wake?: string;
  /**
   * Optional features to install in this app, such as `sync` from `rousejs/sync`.
   * Each is installed once, while the app is created. Throws if a plugin comes from a
   * different release than the core library.
   */
  plugins?: readonly RousePlugin[];
}
/**
 * The options passed to `rouse()`, with defaults filled in, read from `app.config`.
 * `root` is the resolved element, the same one `app.root` returns.
 */
interface ResolvedConfig {
  root: HTMLElement;
  baseUrl: string;
  headers: Record<string, string | null>;
  credentials?: RequestCredentials;
  timeout: number;
  wake: string;
  /** The installed plugins, each listed once. */
  plugins: readonly RousePlugin[];
}
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
export declare class RouseApp {
  readonly root: HTMLElement;
  readonly config: Readonly<ResolvedConfig>;
  stores: StoreManager;
  isReady: boolean;
  /**
   * Makes a network request using the app's configuration. Registered interceptors,
   * default headers, and credentials all apply, and a relative URL is resolved against
   * the configured `baseUrl`. Inside a scope, pass `signal: term` to abort the request
   * when the scope is destroyed.
   *
   * @example
   * const { data, error } = await app.fetch('/api/user');
   * const { data } = await app.fetch('/api/search', { signal: term });
   */
  fetch: RouseFetch;
  /**
   * Adds an event listener that is auto-removed when the app is destroyed. Listens
   * on `app.root` unless an `EventTarget` is passed first. Inside a scope, pass the
   * host and `signal: term` to listen on the scope's element until it is destroyed.
   *
   * @returns A teardown closure that removes the listener early.
   *
   * @example
   * app.on('click', onClick, { debounce: 300 });
   * app.on(window, 'online', sync);
   * app.on({ interval: '30s' }, refresh);
   * app.on(host, 'input', search, { signal: term });
   */
  on: BoundOn;
  private _hasStarted;
  private _destroyed;
  private _abortController;
  /**
   * Resolves the root, marks it with `data-rouse-app`, and wires the stores, scopes,
   * interceptors, and app-lifetime `AbortController`.
   *
   * @throws If the root cannot be found, or already has an app attached.
   */
  constructor(config?: RouseConfig);
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
  scope<E extends Element = HTMLElement>(name: string, setup: ScopeSetup<E>): this;
  /**
   * Creates a reactive store and returns its data proxy.
   *
   * A store is one flat object. Data, getters, and methods live side by side.
   * Getters are cached as computeds bound to the proxy and must stay pure. Work
   * that needs cleanup belongs in a scope instead. Snapshots and incoming data touch
   * only plain, JSON-serializable data, never methods or getters.
   *
   * **Sync:** with the `sync` plugin installed, `config` also takes the store's
   * endpoint (`url`) and request options, and the store syncs with that endpoint as a
   * whole.
   *
   * **Persistence:** pass `persist` and `persistKey` to keep the data in the browser
   * across page loads.
   * - The saved copy is restored on creation.
   * - Every change saves the data fields as JSON.
   * - Saving stops on `stores.remove()` and `destroy()`. The saved copy stays in storage.
   *
   * @template T - Shape of the store's data, getters, and methods.
   * @param name - Unique name. Referenced as `@name` in directives.
   * @param data - Initial state, made reactive.
   * @param config - `persist` (`'local'` or `'session'`) with a `persistKey` used
   *   verbatim as the storage key. The `sync` plugin adds `url` and request options.
   * @returns The store's reactive proxy.
   * @throws If a store of this name already exists, or if `persist` is not `'local'` or
   *   `'session'` with a `persistKey`. With sync, also if `persist` is combined with
   *   `url`.
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
   * });
   *
   * cart.items.push(item);
   *
   * @example
   * app.store('prefs', { theme: 'light' }, { persist: 'local', persistKey: 'prefs' });
   *
   * @example
   * // With the sync plugin: rouse({ plugins: [sync] })
   * app.store('user', { name: '' }, { url: '/api/user' });
   */
  store<T extends object>(name: string, data: T, config?: StoreOptions & PersistOptions): T;
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
  place(target: Element | string, content: string, options?: PlaceOptions): boolean;
  /**
   * Registers a network interceptor. Interceptors run in FIFO order and are
   * `await`ed sequentially, so async interceptors block subsequent ones in
   * the same phase. Inside a scope, pass `signal: term` to remove it when the
   * scope is destroyed.
   *
   * A request interceptor can change the config in place or return the fields to
   * change, including `url` to send the request somewhere else. Leaving a field out
   * of the returned object doesn't remove it: set it to `undefined` instead.
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
   * app.interceptor('request', addScopeHeader, { signal: term });
   */
  interceptor(phase: 'request', fn: RequestInterceptor, options?: InterceptorOptions): VoidFn;
  interceptor(phase: 'response', fn: ResponseInterceptor, options?: InterceptorOptions): VoidFn;
  interceptor(phase: 'error', fn: ErrorInterceptor, options?: InterceptorOptions): VoidFn;
  /**
   * Triggers a Rouse network request. `options.triggerEl` marks an originating
   * element; without one nothing is read from the DOM and the `rz:fetch:*`
   * events fire from the app root.
   */
  private _fetch;
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
  start(): void;
  /**
   * Shuts the app down: stops watching the DOM, unmounts every scope, unbinds
   * every directive, then fires `rz:app:destroy` and aborts the app's signal.
   *
   * This is final. Aborting drops `app.on` listeners and any request still in
   * flight, and `start()` will not run again. Does nothing if the app never
   * started or is already gone.
   */
  destroy(): void;
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
export declare function rouse(config?: RouseConfig): RouseApp;
/**
 * Dispatches a custom event from an element.
 *
 * @param options - Allows overriding cancelable/bubbles
 */
export declare function dispatch<N extends string>(el: EventTarget, name: N, detail?: N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any, options?: CustomEventInit): CustomEvent<N extends keyof LifecycleEventMap ? LifecycleEventMap[N] : any>;
/**
 * Generates a short key, unique for the lifetime of the page. Intended for
 * assigning stable identity to client-created items in keyed lists.
 *
 * Call it once when creating the item and store the result on the item. Never
 * call it during render or inside a getter because every call returns a new key,
 * which defeats keyed reconciliation. Keys are sequential, not random. Don't use
 * them as secrets or persist them as permanent ids.
 *
 * @example
 * const key = createKey(); // 'rz_mbx3k2f81000'
 * todos.items.push({ key, text });
 * // In HTML, use as stable id via `rz-key`
 * <template data-rz-render="items" data-rz-key="key">
 */
export declare function createKey(prefix?: string): string;
/** Options for the two-argument form of `effect()`. */
interface EffectOptions {
  /** Skip the first `apply`. The first call then receives the first changed value. */
  defer?: boolean;
}
/**
 * Runs `fn` now, and again whenever a reactive value it read changes.
 *
 * If `fn` returns a function, that function is a cleanup. It runs before each re-run
 * and when the effect stops. Any other return value is ignored.
 *
 * Stops with the scope when called during setup or `connect()`. Otherwise it runs
 * until the returned function is called.
 *
 * @param fn - The side effect. Every reactive read inside it is tracked.
 * @returns A function that stops the effect.
 *
 * @example
 * const stop = effect(() => console.log(state.count));
 */
export declare function effect(fn: () => unknown): () => void;
/**
 * Runs `apply` with the value `compute` returns, and again whenever that value
 * changes (compared with `!==`).
 *
 * - **Tracking:** only reads inside `compute` trigger a re-run. Reads inside `apply`
 *   are never tracked.
 * - **First run:** `apply` runs immediately, with `prev` set to `undefined`. With
 *   `defer: true`, it first runs on the first change, with `prev` set to the initial
 *   value.
 * - **Stopping:** `apply` receives `stop`, which ends the effect from any run,
 *   including the first.
 * - **Cleanup:** if `apply` returns a function, it runs before the next `apply` and
 *   when the effect stops. Any other return value is ignored.
 * - **Nested effects:** an effect created inside `apply` stops before the next `apply`
 *   and when this effect stops.
 *
 * Stops with the scope when called during setup or `connect()`. Otherwise it runs
 * until the returned function is called.
 *
 * @param compute - Reads the state to follow and returns a value. Must `return`.
 *   A signal works as is.
 * @param apply - Acts on the new value. Receives the previous value and `stop`.
 * @param options - `defer` skips the first `apply`.
 * @returns A function that stops the effect.
 *
 * @example
 * effect(
 *   () => state.query,
 *   (query) => {
 *     const url = new URL(location.href);
 *     url.searchParams.set('q', query);
 *     history.replaceState(null, '', url);
 *   },
 * );
 */
export declare function effect<T>(compute: {
  (): T;
  (value: T): void;
} | (() => T), apply: (value: T, prev: T | undefined, stop: () => void) => unknown, options?: EffectOptions): () => void;
/** Options for `selection()`. */
interface SelectionOptions {
  /** Allow more than one selected item. By default, selecting an item deselects the rest. */
  multiple?: boolean;
  /**
   * Field path that identifies an item, such as `'id'`. Without it, items are identified
   * by their position in the list, so the selection stays on a position when the list
   * reorders.
   */
  key?: string;
  /** Clears the selection whenever the value this returns changes. */
  clearOn?: () => unknown;
}
/**
 * Selection state for the items of a rendered list. The item methods take the handler
 * context, so a binding or an event handler can name them directly. They work without
 * `this`.
 */
interface Selection<Key = unknown> {
  /** Returns whether the item is selected. Re-runs a binding only when the result changes. */
  isSelected(ctx: HandlerCtx<Element>): boolean;
  /** Selects the item, or deselects it if selected. Returns whether it is now selected. */
  toggle(ctx: HandlerCtx<Element>): boolean;
  /** Selects the item. Without `multiple`, deselects the rest. */
  select(ctx: HandlerCtx<Element>): void;
  /** Deselects the item. */
  deselect(ctx: HandlerCtx<Element>): void;
  /** Deselects every item. */
  clear(): void;
  /** Replaces the selection. Without `multiple`, keeps only the last key. */
  set(keys: Iterable<Key>): void;
  /** The selected keys, in selection order. Reactive. */
  readonly keys: readonly Key[];
}
/**
 * Tracks which items of a rendered list are selected, expanded, or active, without
 * writing that state into the list's data.
 *
 * - **Keys:** items are identified by their position in the list, or by the field that
 *   `key` names. Use a field for a list that reorders or comes from a store.
 * - **Single or multiple:** by default, selecting an item deselects the rest. Pass
 *   `multiple: true` to select items independently.
 * - **Clearing:** `clearOn` clears the selection when the value it returns changes,
 *   such as the list's source data. Called during setup, it stops with the scope.
 *
 * @param options - `multiple`, `key`, and `clearOn`.
 * @returns The selection. Return it from a scope's setup to use it in markup.
 *
 * @example
 * const days = selection({ key: 'date', clearOn: () => weather.data });
 * return { days };
 *
 * // <li data-rz-class="active: days.isSelected" data-rz-on="click: days.toggle">
 */
export declare function selection<Key = unknown>(options?: SelectionOptions): Selection<Key>;
export { type BindableValue, type EffectOptions, type HandlerCtx, type LifecycleEvent, type LifecycleEventMap, type PersistStorage, type ReactiveOptions, type RenderHandlerCtx, type RouseConfig, type RousePlugin, type RouseSse, type ScopeCtx, type ScopeSetup, type Selection, type SelectionOptions, type SseOptions, type StoreManager, type StoreOptions, rouse as default };
//# sourceMappingURL=rouse.d.ts.map