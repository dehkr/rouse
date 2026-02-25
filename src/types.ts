import type { StoreManager } from './core/store';

export type BindableValue =
  | string
  | string[]
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean> // For class bindings
  | Record<string, string>; // For style bindings

/** Callback signature for the global event bus */
export type BusCallback<T = any> = (data?: T) => void;

/**
 * The object returned by a setup function.
 * Includes standard lifecycle hooks and any custom state/methods.
 */
export type RouseController = Record<string, any> & {
  connect?: () => void;
  disconnect?: () => void;
};

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

export interface RequestResult<T = any> {
  data: T | null;
  error: RequestError | null;
  response: Response | null;
}

export interface RouseReqOpts extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, any> | any[] | null | undefined;
  triggerEl?: HTMLElement;
  serializeForm?: HTMLFormElement;
  skipInterceptors?: boolean;
  onUploadProgress?: (ev: ProgressEvent) => void;
  retry?: number;
  timeout?: number;
  abortKey?: string | symbol;
}

export interface NetworkInterceptors {
  onRequest?: (config: RouseReqOpts) => RouseReqOpts | Promise<RouseReqOpts>;
  onResponse?: (
    data: any,
    response: Response,
    config: RouseReqOpts,
  ) => any | Promise<any>;
  onError?: (error: any, config: RouseReqOpts) => void;
}

/**
 * The context object passed into every controller setup function.
 * @template P - The type of the props (rz-props).
 */
export type SetupContext<P extends Record<string, any> = Record<string, any>> = {
  el: HTMLElement;
  props: P;
  dispatch: (name: string, detail?: any, options?: CustomEventInit) => CustomEvent;
  request: <T = any>(url: string, options?: RouseReqOpts) => Promise<RequestResult<T>>;
  bus: {
    publish: (event: string, data?: any) => void;
    subscribe: (event: string, cb: BusCallback) => void;
    unsubscribe: (event: string, cb: BusCallback) => void;
  };
  stores: StoreManager;
};

/**
 * The definition of a setup function.
 */
export type SetupFn<P extends Record<string, any> = Record<string, any>> = (
  ctx: SetupContext<P>,
) => RouseController;
